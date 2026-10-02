import { sql } from "@everycent/db";
import { budgetAccount, category, payee, subTransaction, transaction } from "@everycent/db/schema";
import { usesCategory } from "@everycent/engine";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, eq, exists, inArray, isNull, notInArray, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { loadBudgetAccess } from "../../lib/budget-access";
import { AppError } from "../../lib/errors";
import { type Db, transferPayeeId } from "../../lib/ledger";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import { applyUpdate, deleteWithTransfers } from "./handlers";
import { matchingTransactions, type RegisterFilter, type SearchSettings } from "./register-query";
import type { bulkUpdateTransactions, summarizeSelection } from "./routes";
import {
  type AccountRow,
  usesCategory as accountUsesCategory,
  assertOpen,
  findAccount,
  lockTransaction,
  resolveCategory,
} from "./rules";

type Env = AppEnv & AuthedEnv;

type Selection = { ids: string[] } | { filter: RegisterFilter; exclude: string[] };

/** The selected transactions' ids, as a condition on `transaction.id`. */
function selectedWhere(
  db: Db,
  budgetId: string,
  selection: Selection,
  settings: SearchSettings,
): SQL {
  if ("ids" in selection) {
    return and(eq(transaction.budgetId, budgetId), inArray(transaction.id, selection.ids)) as SQL;
  }
  const matching = matchingTransactions(db, budgetId, selection.filter, settings);
  return and(
    eq(transaction.budgetId, budgetId),
    inArray(transaction.id, db.select({ id: matching.id }).from(matching)),
    selection.exclude.length > 0 ? notInArray(transaction.id, selection.exclude) : undefined,
  ) as SQL;
}

async function checkFilterAccount(db: Db, budgetId: string, selection: Selection) {
  if ("filter" in selection && selection.filter.accountId) {
    await findAccount(db, budgetId, selection.filter.accountId);
  }
}

/** What the action bar needs to know about each selected row. */
function selectedRows(db: Db, where: SQL) {
  const transferAccount = alias(budgetAccount, "transfer_account");
  const linePayee = alias(payee, "line_payee");
  return db
    .select({
      id: transaction.id,
      amount: transaction.amount,
      cleared: transaction.cleared,
      accountType: budgetAccount.type,
      transferAccountType: transferAccount.type,
      fromSplit: sql<boolean>`${transaction.transferSubTransactionId} is not null`,
      isSplit: sql<boolean>`${exists(
        db
          .select({ one: sql`1` })
          .from(subTransaction)
          .where(eq(subTransaction.transactionId, transaction.id)),
      )}`,
      hasTransferLine: sql<boolean>`${exists(
        db
          .select({ one: sql`1` })
          .from(subTransaction)
          .innerJoin(linePayee, eq(linePayee.id, subTransaction.payeeId))
          .where(
            and(
              eq(subTransaction.transactionId, transaction.id),
              sql`${linePayee.transferAccountId} is not null`,
            ),
          ),
      )}`,
    })
    .from(transaction)
    .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
    .leftJoin(payee, eq(payee.id, transaction.payeeId))
    .leftJoin(transferAccount, eq(transferAccount.id, payee.transferAccountId))
    .where(where);
}

type SelectedRow = Awaited<ReturnType<typeof selectedRows>>[number];

/** Transfers within the budget and tracking-account rows have no category. */
function categorizable(row: SelectedRow) {
  return row.isSplit || usesCategory(row.accountType, row.transferAccountType);
}

export const summarizeSelectionHandler: RouteHandler<typeof summarizeSelection, Env> = async (
  c,
) => {
  const { budgetId } = c.req.valid("param");
  const { selection } = c.req.valid("json");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId);
  await checkFilterAccount(db, budgetId, selection);
  const rows = await selectedRows(db, selectedWhere(db, budgetId, selection, budget));
  const count = (test: (row: SelectedRow) => boolean) => rows.filter(test).length;
  return c.json(
    {
      count: rows.length,
      total: rows.reduce((sum, r) => sum + r.amount, 0n).toString(),
      uncleared: count((r) => r.cleared === "uncleared"),
      cleared: count((r) => r.cleared === "cleared"),
      reconciled: count((r) => r.cleared === "reconciled"),
      categorizable: count(categorizable),
      splits: count((r) => r.isSplit),
      splitsWithTransfers: count((r) => r.isSplit && r.hasTransferLine),
      deletable: count((r) => !r.fromSplit),
    },
    200,
  );
};

export const bulkUpdateTransactionsHandler: RouteHandler<
  typeof bulkUpdateTransactions,
  Env
> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const { selection, action } = c.req.valid("json");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(
    c,
    budgetId,
    action.type === "delete" ? { transaction: ["delete"] } : { transaction: ["update"] },
  );
  await checkFilterAccount(db, budgetId, selection);

  const updated = await db.transaction(async (tx) => {
    // Lock the selection before reading what the actions below check.
    const where = selectedWhere(tx, budgetId, selection, budget);
    const locked = await tx
      .select({ id: transaction.id })
      .from(transaction)
      .where(where)
      .orderBy(transaction.id)
      .for("update");
    if (locked.length === 0) return 0;
    const lockedIds = locked.map((r) => r.id);
    const rows = await selectedRows(tx, selectedIds(lockedIds));

    switch (action.type) {
      case "cleared": {
        const ids = rows.filter((r) => r.cleared !== "reconciled").map((r) => r.id);
        if (ids.length > 0) {
          await tx.update(transaction).set({ cleared: action.cleared }).where(selectedIds(ids));
        }
        return ids.length;
      }
      case "flag":
        await tx.update(transaction).set({ flag: action.flag }).where(selectedIds(lockedIds));
        return lockedIds.length;
      case "memo":
        await tx.update(transaction).set({ memo: action.memo }).where(selectedIds(lockedIds));
        return lockedIds.length;
      case "categorize":
        return categorize(tx, budgetId, rows, action.categoryId);
      case "move":
        return move(tx, budgetId, lockedIds, action.accountId);
      case "delete":
        return remove(tx, budgetId, lockedIds);
    }
  });
  return c.json({ updated }, 200);
};

/**
 * YNAB's bulk categorize: splits are un-split, unless they have a transfer line; those stay
 * split and every other line takes the category. Rows without a category are skipped.
 */
async function categorize(tx: Db, budgetId: string, rows: SelectedRow[], categoryId: string) {
  const [target] = await tx
    .select({ linkedAccountId: category.linkedAccountId })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.budgetId, budgetId)));
  if (!target) throw new AppError(400, "BAD_REQUEST", "No such category in this budget");
  if (target.linkedAccountId) {
    throw new AppError(
      400,
      "CATEGORY_NOT_ALLOWED",
      "Credit card payment categories can't be used on transactions",
    );
  }
  const keepSplit = rows.filter((r) => r.isSplit && r.hasTransferLine).map((r) => r.id);
  const unsplit = rows.filter((r) => r.isSplit && !r.hasTransferLine).map((r) => r.id);
  const plain = rows.filter((r) => !r.isSplit && categorizable(r)).map((r) => r.id);
  if (keepSplit.length > 0) {
    const transferPayees = tx
      .select({ id: payee.id })
      .from(payee)
      .where(sql`${payee.transferAccountId} is not null`);
    await tx
      .update(subTransaction)
      .set({ categoryId })
      .where(
        and(
          sql`${subTransaction.transactionId} = any(${sql.param(keepSplit)}::text[])`,
          or(isNull(subTransaction.payeeId), notInArray(subTransaction.payeeId, transferPayees)),
        ),
      );
  }
  if (unsplit.length > 0) {
    await tx
      .delete(subTransaction)
      .where(sql`${subTransaction.transactionId} = any(${sql.param(unsplit)}::text[])`);
  }
  const categorized = [...unsplit, ...plain];
  if (categorized.length > 0) {
    await tx.update(transaction).set({ categoryId }).where(selectedIds(categorized));
  }
  return keepSplit.length + categorized.length;
}

/**
 * Moves each row as a single edit would. Skipped, as YNAB does: rows already in the account,
 * transfers into their own other account, and splits with a transfer line to it.
 */
async function move(tx: Db, budgetId: string, ids: readonly string[], accountId: string) {
  const target = await findAccount(tx, budgetId, accountId);
  assertOpen(target);
  let moved = 0;
  for (const id of ids) {
    // Read afresh: an earlier move in this loop may have changed it (both sides of a transfer).
    const row = await lockTransaction(tx, budgetId, id);
    if (!row || row.accountId === target.id) continue;
    if (row.transferSubTransactionId) {
      if (await moveSplitTransferSide(tx, budgetId, row, target)) moved++;
      continue;
    }
    if (row.transferTransactionId) {
      const other = await lockTransaction(tx, budgetId, row.transferTransactionId);
      if (other?.accountId === target.id) continue;
    }
    if (await hasTransferLineTo(tx, row.id, target.id)) continue;
    await applyUpdate(tx, budgetId, row.id, { accountId: target.id });
    moved++;
  }
  return moved;
}

async function hasTransferLineTo(tx: Db, splitId: string, accountId: string) {
  const [line] = await tx
    .select({ id: subTransaction.id })
    .from(subTransaction)
    .innerJoin(payee, eq(payee.id, subTransaction.payeeId))
    .where(and(eq(subTransaction.transactionId, splitId), eq(payee.transferAccountId, accountId)))
    .limit(1);
  return Boolean(line);
}

/**
 * Moves the other side of a split's transfer line: the line then transfers to `target`. Not
 * into the split's own account (it would transfer to itself).
 */
async function moveSplitTransferSide(
  tx: Db,
  budgetId: string,
  side: typeof transaction.$inferSelect,
  target: AccountRow,
) {
  const [line] = await tx
    .select({
      id: subTransaction.id,
      categoryId: subTransaction.categoryId,
      splitAccountId: transaction.accountId,
    })
    .from(subTransaction)
    .innerJoin(transaction, eq(transaction.id, subTransaction.transactionId))
    .where(eq(subTransaction.id, side.transferSubTransactionId ?? ""));
  if (!line || line.splitAccountId === target.id) return false;
  const splitAccount = await findAccount(tx, budgetId, line.splitAccountId);
  const keepLine = accountUsesCategory(splitAccount, target) ? line.categoryId : null;
  await tx
    .update(subTransaction)
    .set({
      payeeId: await transferPayeeId(tx, target),
      categoryId: await resolveCategory(tx, budgetId, splitAccount, target, keepLine),
    })
    .where(eq(subTransaction.id, line.id));
  const keepSide = accountUsesCategory(target, splitAccount) ? side.categoryId : null;
  await tx
    .update(transaction)
    .set({
      accountId: target.id,
      currency: target.currency,
      categoryId: await resolveCategory(tx, budgetId, target, splitAccount, keepSide),
    })
    .where(eq(transaction.id, side.id));
  return true;
}

/**
 * Deletes each row with its transfer's other side (or a split's lines' ones). The other sides of
 * splits' transfer lines are skipped: they go with their split.
 */
async function remove(tx: Db, budgetId: string, ids: readonly string[]) {
  let deleted = 0;
  for (const id of ids) {
    // Gone already when it was the other side of a transfer deleted earlier in this loop.
    const row = await lockTransaction(tx, budgetId, id);
    if (!row || row.transferSubTransactionId) continue;
    await deleteWithTransfers(tx, budgetId, row);
    deleted++;
  }
  return deleted;
}

/** One array parameter rather than one per id, so big selections stay one statement. */
function selectedIds(ids: readonly string[]) {
  return sql`${transaction.id} = any(${sql.param(ids)}::text[])`;
}
