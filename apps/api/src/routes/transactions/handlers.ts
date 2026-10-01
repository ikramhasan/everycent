import { sql } from "@everycent/db";
import { budgetAccount, category, payee, subTransaction, transaction } from "@everycent/db/schema";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { loadBudgetAccess } from "../../lib/budget-access";
import { AppError } from "../../lib/errors";
import { type Db, findOrCreatePayee, insertTransaction, transferPayeeId } from "../../lib/ledger";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type {
  createTransaction,
  deleteTransaction,
  listPayees,
  listTransactions,
  updateTransaction,
} from "./routes";
import {
  type AccountRow,
  assertNotSelf,
  assertOnePayee,
  assertOpen,
  findAccount,
  insertOtherSide,
  lockTransaction,
  reconciledOtherSide,
  resolveCategory,
  transferInSplit,
  usesCategory,
} from "./rules";
import {
  assertLinesAddUp,
  assertSplitAllowed,
  deleteLineTransfers,
  splitLines,
  syncLines,
} from "./splits";

type Env = AppEnv & AuthedEnv;
type Filter = { accountId?: string; transactionId?: string };

function filterWhere(budgetId: string, filter: Filter) {
  return and(
    eq(transaction.budgetId, budgetId),
    filter.accountId ? eq(transaction.accountId, filter.accountId) : undefined,
    filter.transactionId ? eq(transaction.id, filter.transactionId) : undefined,
  );
}

/** The lines of the split transactions that `filter` selects, grouped by transaction. */
async function queryLines(db: Db, budgetId: string, filter: Filter) {
  const other = alias(transaction, "other_side");
  const rows = await db
    .select({
      id: subTransaction.id,
      transactionId: subTransaction.transactionId,
      amount: subTransaction.amount,
      payeeId: subTransaction.payeeId,
      payeeName: payee.name,
      categoryId: subTransaction.categoryId,
      categoryName: category.name,
      memo: subTransaction.memo,
      transferAccountId: payee.transferAccountId,
      transferTransactionId: other.id,
    })
    .from(subTransaction)
    .innerJoin(transaction, eq(transaction.id, subTransaction.transactionId))
    .leftJoin(payee, eq(payee.id, subTransaction.payeeId))
    .leftJoin(category, eq(category.id, subTransaction.categoryId))
    .leftJoin(other, eq(other.transferSubTransactionId, subTransaction.id))
    .where(filterWhere(budgetId, filter))
    .orderBy(asc(subTransaction.sortOrder), asc(subTransaction.id));
  const byTransaction = new Map<string, Omit<(typeof rows)[number], "transactionId">[]>();
  for (const { transactionId, ...line } of rows) {
    byTransaction.set(transactionId, [...(byTransaction.get(transactionId) ?? []), line]);
  }
  return byTransaction;
}

/**
 * Register rows with each account's running balance. The window runs over the whole account
 * (oldest first), so filtering by `transactionId` happens outside it.
 */
async function queryTransactions(db: Db, budgetId: string, filter: Filter) {
  const rows = db
    .select({
      id: transaction.id,
      accountId: transaction.accountId,
      accountName: sql<string>`${budgetAccount.name}`.as("account_name"),
      date: transaction.date,
      amount: transaction.amount,
      currency: transaction.currency,
      payeeId: transaction.payeeId,
      payeeName: sql<string | null>`${payee.name}`.as("payee_name"),
      categoryId: transaction.categoryId,
      categoryName: sql<string | null>`${category.name}`.as("category_name"),
      memo: transaction.memo,
      cleared: transaction.cleared,
      transferAccountId: sql<string | null>`${payee.transferAccountId}`.as("transfer_account_id"),
      // A split line's transfer points at the split itself.
      transferTransactionId: sql<string | null>`coalesce(${transaction.transferTransactionId}, (
        select ${subTransaction.transactionId} from ${subTransaction}
        where ${subTransaction.id} = ${transaction.transferSubTransactionId}
      ))`.as("transfer_transaction_id"),
      transferFromSplit: sql<boolean>`${transaction.transferSubTransactionId} is not null`.as(
        "transfer_from_split",
      ),
      createdAt: transaction.createdAt,
      runningBalance: sql<string>`sum(${transaction.amount}) over (
        partition by ${transaction.accountId}
        order by ${transaction.date}, ${transaction.createdAt}, ${transaction.id}
      )`.as("running_balance"),
    })
    .from(transaction)
    .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
    .leftJoin(payee, eq(payee.id, transaction.payeeId))
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(
      and(
        eq(transaction.budgetId, budgetId),
        filter.accountId ? eq(transaction.accountId, filter.accountId) : undefined,
      ),
    )
    .as("register");
  const result = await db
    .select()
    .from(rows)
    .where(filter.transactionId ? eq(rows.id, filter.transactionId) : undefined)
    .orderBy(desc(rows.date), desc(rows.createdAt), desc(rows.id));
  const lines = await queryLines(db, budgetId, filter);
  return result.map(({ createdAt: _, ...r }) => ({
    ...r,
    amount: r.amount.toString(),
    subtransactions: (lines.get(r.id) ?? []).map((l) => ({ ...l, amount: l.amount.toString() })),
    // Postgres returns numeric sums as strings; BigInt normalizes them exactly.
    runningBalance: BigInt(r.runningBalance).toString(),
  }));
}

async function transactionJson(db: Db, budgetId: string, accountId: string, id: string) {
  const [row] = await queryTransactions(db, budgetId, { accountId, transactionId: id });
  if (!row) throw new AppError(404, "NOT_FOUND", "Transaction not found");
  return row;
}

export const listTransactionsHandler: RouteHandler<typeof listTransactions, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const { accountId } = c.req.valid("query");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId);
  if (accountId) await findAccount(db, budgetId, accountId);
  return c.json({ transactions: await queryTransactions(db, budgetId, { accountId }) }, 200);
};

export const createTransactionHandler: RouteHandler<typeof createTransaction, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const body = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["create"] });
  assertOnePayee(body);
  const id = await db.transaction(async (tx) => {
    const account = await findAccount(tx, budgetId, body.accountId);
    assertOpen(account);
    let transferTo: AccountRow | null = null;
    if (body.transferAccountId !== undefined) {
      transferTo = await findAccount(tx, budgetId, body.transferAccountId);
      assertNotSelf(account, transferTo);
      assertOpen(transferTo);
    }
    const amount = BigInt(body.amount);
    const split = body.subtransactions;
    if (split) {
      if (transferTo) notSplittable();
      if (body.categoryId !== null) categoryOnSplit();
      assertSplitAllowed(account);
      assertLinesAddUp(split, amount);
    }
    const id = await insertTransaction(tx, {
      budgetId,
      accountId: account.id,
      date: body.date,
      amount,
      currency: account.currency,
      payeeId: transferTo
        ? await transferPayeeId(tx, transferTo)
        : body.payeeName
          ? await findOrCreatePayee(tx, budgetId, body.payeeName)
          : null,
      categoryId: split
        ? null
        : await resolveCategory(tx, budgetId, account, transferTo, body.categoryId),
      memo: body.memo,
      cleared: body.cleared,
    });
    if (split) {
      await syncLines(
        tx,
        { budgetId, parentId: id, date: body.date, account, moved: false },
        split,
      );
    }
    if (transferTo) {
      await insertOtherSide(
        tx,
        { id, budgetId, date: body.date, amount, memo: body.memo },
        account,
        transferTo,
      );
    }
    return id;
  });
  return c.json(await transactionJson(db, budgetId, body.accountId, id), 201);
};

export const updateTransactionHandler: RouteHandler<typeof updateTransaction, Env> = async (c) => {
  const { budgetId, transactionId } = c.req.valid("param");
  const body = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["update"] });
  assertOnePayee(body);
  const accountId = await db.transaction(async (tx) => {
    const existing = await lockTransaction(tx, budgetId, transactionId);
    if (!existing) throw new AppError(404, "NOT_FOUND", "Transaction not found");
    if (existing.transferSubTransactionId) {
      return updateSplitTransferSide(tx, budgetId, existing, body);
    }
    const other = existing.transferTransactionId
      ? await lockTransaction(tx, budgetId, existing.transferTransactionId)
      : undefined;

    const moved = body.accountId !== undefined && body.accountId !== existing.accountId;
    const account = await findAccount(tx, budgetId, body.accountId ?? existing.accountId);
    if (moved) assertOpen(account);

    // The account the other side belongs in: unchanged unless the payee changes.
    const targetId =
      body.transferAccountId ?? (body.payeeName !== undefined ? null : (other?.accountId ?? null));
    const retargeted = targetId !== (other?.accountId ?? null);
    let transferTo: AccountRow | null = null;
    if (targetId !== null) {
      transferTo = await findAccount(tx, budgetId, targetId);
      assertNotSelf(account, transferTo);
      if (retargeted) {
        assertOpen(account);
        assertOpen(transferTo);
      }
    }

    const amount = body.amount === undefined ? existing.amount : BigInt(body.amount);
    if (other?.cleared === "reconciled") {
      const dateChanges = body.date !== undefined && body.date !== other.date;
      if (retargeted || dateChanges || amount !== -other.amount) reconciledOtherSide();
    }

    // A split stays one until it gets a category (or becomes a transfer); see `syncLines`.
    const existingLines = await splitLines(tx, transactionId);
    const wasSplit = existingLines.length > 0;
    const lines = body.subtransactions;
    if (lines && body.categoryId !== undefined) categoryOnSplit();
    const unsplit = wasSplit && !lines && (body.categoryId !== undefined || transferTo !== null);
    const split = lines !== undefined || (wasSplit && !unsplit);
    if (split) {
      if (transferTo) notSplittable();
      assertSplitAllowed(account);
      if (lines) assertLinesAddUp(lines, amount);
      else
        assertLinesAddUp(
          existingLines.map((l) => ({ amount: l.amount.toString() })),
          amount,
        );
    }

    let categoryId = existing.categoryId;
    if (split) {
      categoryId = null;
    } else if (body.categoryId !== undefined) {
      categoryId = await resolveCategory(tx, budgetId, account, transferTo, body.categoryId);
    } else if (moved || retargeted) {
      // Keep the category if it can still be used, otherwise fall back.
      const keep = usesCategory(account, transferTo) ? existing.categoryId : null;
      categoryId = await resolveCategory(tx, budgetId, account, transferTo, keep);
    }

    await tx
      .update(transaction)
      .set({
        accountId: account.id,
        currency: account.currency,
        date: body.date,
        amount,
        payeeId: transferTo
          ? await transferPayeeId(tx, transferTo)
          : body.payeeName === undefined
            ? undefined
            : body.payeeName === null
              ? null
              : await findOrCreatePayee(tx, budgetId, body.payeeName),
        categoryId,
        memo: body.memo,
        cleared: body.cleared,
        transferTransactionId: transferTo ? undefined : null,
      })
      .where(eq(transaction.id, transactionId));

    if (split || wasSplit) {
      await syncLines(
        tx,
        { budgetId, parentId: transactionId, date: body.date ?? existing.date, account, moved },
        unsplit ? [] : lines,
      );
    }

    if (other && !transferTo) {
      await tx.delete(transaction).where(eq(transaction.id, other.id));
    } else if (other && transferTo) {
      // Date and amount are shared; memo, cleared and category stay per side.
      const keep = usesCategory(transferTo, account) ? other.categoryId : null;
      await tx
        .update(transaction)
        .set({
          accountId: transferTo.id,
          currency: transferTo.currency,
          date: body.date,
          amount: -amount,
          payeeId: moved ? await transferPayeeId(tx, account) : undefined,
          categoryId:
            moved || retargeted
              ? await resolveCategory(tx, budgetId, transferTo, account, keep)
              : undefined,
        })
        .where(eq(transaction.id, other.id));
    } else if (transferTo) {
      await insertOtherSide(
        tx,
        {
          id: transactionId,
          budgetId,
          date: body.date ?? existing.date,
          amount,
          memo: body.memo ?? existing.memo,
        },
        account,
        transferTo,
      );
    }
    return account.id;
  });
  return c.json(await transactionJson(db, budgetId, accountId, transactionId), 200);
};

export const deleteTransactionHandler: RouteHandler<typeof deleteTransaction, Env> = async (c) => {
  const { budgetId, transactionId } = c.req.valid("param");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["delete"] });
  await db.transaction(async (tx) => {
    const existing = await lockTransaction(tx, budgetId, transactionId);
    if (!existing) throw new AppError(404, "NOT_FOUND", "Transaction not found");
    if (existing.transferSubTransactionId) transferInSplit();
    await deleteLineTransfers(tx, existing.id);
    const ids = [existing.id];
    if (existing.transferTransactionId) {
      const other = await lockTransaction(tx, budgetId, existing.transferTransactionId);
      if (other?.cleared === "reconciled") reconciledOtherSide();
      ids.push(existing.transferTransactionId);
    }
    await tx.delete(transaction).where(inArray(transaction.id, ids));
  });
  return c.body(null, 204);
};

function notSplittable(): never {
  throw new AppError(
    400,
    "SPLIT_NOT_ALLOWED",
    "A transfer can't be split. Make the split's lines transfers instead.",
  );
}

function categoryOnSplit(): never {
  throw new AppError(
    400,
    "BAD_REQUEST",
    "A split's categories go on its lines; give either `categoryId` or `subtransactions`",
  );
}

/**
 * The other side of a split's transfer line: the split owns its date, amount, account and payee,
 * so only memo, cleared and (where one applies) the category change here.
 */
async function updateSplitTransferSide(
  tx: Db,
  budgetId: string,
  existing: typeof transaction.$inferSelect,
  body: {
    accountId?: string;
    date?: string;
    amount?: string;
    payeeName?: string | null;
    transferAccountId?: string;
    categoryId?: string | null;
    memo?: string;
    cleared?: "uncleared" | "cleared";
    subtransactions?: unknown;
  },
) {
  const locked =
    (body.accountId !== undefined && body.accountId !== existing.accountId) ||
    (body.date !== undefined && body.date !== existing.date) ||
    (body.amount !== undefined && BigInt(body.amount) !== existing.amount) ||
    body.payeeName !== undefined ||
    body.transferAccountId !== undefined ||
    body.subtransactions !== undefined;
  if (locked) transferInSplit();
  const account = await findAccount(tx, budgetId, existing.accountId);
  const [line] = await tx
    .select({ accountId: transaction.accountId })
    .from(subTransaction)
    .innerJoin(transaction, eq(transaction.id, subTransaction.transactionId))
    .where(eq(subTransaction.id, existing.transferSubTransactionId ?? ""));
  const splitAccount = line ? await findAccount(tx, budgetId, line.accountId) : null;
  await tx
    .update(transaction)
    .set({
      categoryId:
        body.categoryId === undefined
          ? undefined
          : await resolveCategory(tx, budgetId, account, splitAccount, body.categoryId),
      memo: body.memo,
      cleared: body.cleared,
    })
    .where(eq(transaction.id, existing.id));
  return account.id;
}

export const listPayeesHandler: RouteHandler<typeof listPayees, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId);
  // YNAB suggests the category last used with a payee; Uncategorized isn't worth remembering.
  const last = sql<string | null>`(
    select t.category_id from ${transaction} t
    join ${category} c on c.id = t.category_id
    where t.payee_id = ${payee}.id and c.internal_kind is distinct from 'uncategorized'
    order by t.date desc, t.created_at desc, t.id desc
    limit 1
  )`;
  const payees = await db
    .select({ id: payee.id, name: payee.name, lastCategoryId: last })
    .from(payee)
    .where(
      and(
        eq(payee.budgetId, budgetId),
        isNull(payee.internalKind),
        isNull(payee.transferAccountId),
      ),
    )
    .orderBy(asc(sql`lower(${payee.name})`), asc(payee.id));
  return c.json({ payees }, 200);
};
