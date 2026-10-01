import { sql } from "@everycent/db";
import { budgetAccount, category, payee, transaction } from "@everycent/db/schema";
import { isOnBudget, usesCategory as usesAccountCategory } from "@everycent/engine";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { loadBudgetAccess } from "../../lib/budget-access";
import { AppError } from "../../lib/errors";
import {
  type Db,
  findOrCreatePayee,
  insertTransaction,
  internalCategoryId,
  transferPayeeId,
} from "../../lib/ledger";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type {
  createTransaction,
  deleteTransaction,
  listPayees,
  listTransactions,
  updateTransaction,
} from "./routes";

type Env = AppEnv & AuthedEnv;
type AccountRow = typeof budgetAccount.$inferSelect;

/**
 * Register rows with each account's running balance. The window runs over the whole account
 * (oldest first), so filtering by `transactionId` happens outside it.
 */
async function queryTransactions(
  db: Db,
  budgetId: string,
  filter: { accountId?: string; transactionId?: string },
) {
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
      transferTransactionId: transaction.transferTransactionId,
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
  return result.map(({ createdAt: _, ...r }) => ({
    ...r,
    amount: r.amount.toString(),
    // Postgres returns numeric sums as strings; BigInt normalizes them exactly.
    runningBalance: BigInt(r.runningBalance).toString(),
  }));
}

async function transactionJson(db: Db, budgetId: string, accountId: string, id: string) {
  const [row] = await queryTransactions(db, budgetId, { accountId, transactionId: id });
  if (!row) throw new AppError(404, "NOT_FOUND", "Transaction not found");
  return row;
}

async function findAccount(db: Db, budgetId: string, accountId: string) {
  const [row] = await db
    .select()
    .from(budgetAccount)
    .where(and(eq(budgetAccount.id, accountId), eq(budgetAccount.budgetId, budgetId)));
  if (!row) throw new AppError(404, "NOT_FOUND", "Account not found");
  return row;
}

function assertOpen(account: AccountRow) {
  if (account.closed) {
    throw new AppError(
      400,
      "ACCOUNT_CLOSED",
      `Reopen ${account.name} to add transactions or transfers to it`,
    );
  }
}

function usesCategory(account: AccountRow, transferTo: AccountRow | null) {
  return usesAccountCategory(account.type, transferTo?.type);
}

/**
 * The category a transaction in `account` (a transfer if `transferTo` is set) is stored with,
 * following YNAB: budget accounts fall back to Uncategorized, and payment categories only receive
 * money by assigning (phase 7), never from a transaction.
 */
async function resolveCategory(
  db: Db,
  budgetId: string,
  account: AccountRow,
  transferTo: AccountRow | null,
  categoryId: string | null,
) {
  if (!usesCategory(account, transferTo)) {
    if (categoryId !== null) {
      throw new AppError(
        400,
        "CATEGORY_NOT_ALLOWED",
        isOnBudget(account.type)
          ? "Transfers between budget accounts don't use categories"
          : "Tracking accounts don't use categories",
      );
    }
    return null;
  }
  if (categoryId === null) return internalCategoryId(db, budgetId, "uncategorized");
  const [row] = await db
    .select({ linkedAccountId: category.linkedAccountId })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.budgetId, budgetId)));
  if (!row) throw new AppError(400, "BAD_REQUEST", "No such category in this budget");
  if (row.linkedAccountId) {
    throw new AppError(
      400,
      "CATEGORY_NOT_ALLOWED",
      "Credit card payment categories can't be used on transactions",
    );
  }
  return categoryId;
}

function assertNotSelf(account: AccountRow, transferTo: AccountRow) {
  if (transferTo.id === account.id) {
    throw new AppError(400, "TRANSFER_SAME_ACCOUNT", "An account can't transfer to itself");
  }
}

function assertOnePayee(body: { payeeName?: string | null; transferAccountId?: string }) {
  if (body.transferAccountId !== undefined && body.payeeName != null) {
    throw new AppError(400, "BAD_REQUEST", "Give a payee name or a transfer account, not both");
  }
}

/** Adds the other side of a new transfer, in `transferTo`, and links the two. */
async function insertOtherSide(
  tx: Db,
  side: { id: string; budgetId: string; date: string; amount: bigint; memo: string },
  account: AccountRow,
  transferTo: AccountRow,
) {
  const otherId = await insertTransaction(tx, {
    budgetId: side.budgetId,
    accountId: transferTo.id,
    date: side.date,
    amount: -side.amount,
    currency: transferTo.currency,
    payeeId: await transferPayeeId(tx, account),
    categoryId: await resolveCategory(tx, side.budgetId, transferTo, account, null),
    memo: side.memo,
    cleared: "uncleared",
    transferTransactionId: side.id,
  });
  await tx
    .update(transaction)
    .set({ transferTransactionId: otherId })
    .where(eq(transaction.id, side.id));
}

async function lockTransaction(tx: Db, budgetId: string, id: string) {
  const [row] = await tx
    .select()
    .from(transaction)
    .where(and(eq(transaction.id, id), eq(transaction.budgetId, budgetId)))
    .for("update");
  return row;
}

function reconciledOtherSide(): never {
  throw new AppError(
    409,
    "TRANSFER_RECONCILED",
    "The other side of this transfer is reconciled. Its date and amount can't change.",
  );
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
      categoryId: await resolveCategory(tx, budgetId, account, transferTo, body.categoryId),
      memo: body.memo,
      cleared: body.cleared,
    });
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

    let categoryId = existing.categoryId;
    if (body.categoryId !== undefined) {
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
