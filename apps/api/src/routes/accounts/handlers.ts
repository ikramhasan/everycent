import { newId } from "@everycent/db";
import { budgetAccount, category, payee, transaction } from "@everycent/db/schema";
import { accountFamily, hasPaymentCategory, isOnBudget } from "@everycent/engine";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, asc, desc, eq, isNull, max, ne, or } from "drizzle-orm";
import { loadBudgetAccess } from "../../lib/budget-access";
import { AppError } from "../../lib/errors";
import {
  type AccountBalances,
  accountBalances,
  createPaymentCategory,
  type Db,
  insertTransaction,
  internalCategoryId,
  internalPayeeId,
  ZERO_BALANCES,
} from "../../lib/ledger";
import { reorder, writeOrder } from "../../lib/ordering";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type {
  closeAccount,
  createAccount,
  deleteAccount,
  listAccounts,
  listAccountTransactions,
  moveAccount,
  reopenAccount,
  updateAccount,
} from "./routes";

type Env = AppEnv & AuthedEnv;
type AccountRow = typeof budgetAccount.$inferSelect;

function toAccountJson(a: AccountRow, balances: AccountBalances, paymentCategoryId: string | null) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    note: a.note,
    closed: a.closed,
    currency: a.currency,
    interestRate: a.interestRate,
    minimumPayment: a.minimumPayment?.toString() ?? null,
    escrowAmount: a.escrowAmount?.toString() ?? null,
    paymentCategoryId,
    balances: {
      cleared: balances.cleared.toString(),
      uncleared: balances.uncleared.toString(),
      working: balances.working.toString(),
    },
  };
}

async function listAccountJson(db: Db, budgetId: string) {
  const accounts = await db
    .select()
    .from(budgetAccount)
    .where(eq(budgetAccount.budgetId, budgetId))
    .orderBy(asc(budgetAccount.sortOrder), asc(budgetAccount.id));
  const payments = await db
    .select({ id: category.id, accountId: category.linkedAccountId })
    .from(category)
    .where(eq(category.budgetId, budgetId));
  const paymentByAccount = new Map(payments.map((p) => [p.accountId, p.id]));
  const balances = await accountBalances(db, budgetId);
  return accounts.map((a) =>
    toAccountJson(a, balances.get(a.id) ?? ZERO_BALANCES, paymentByAccount.get(a.id) ?? null),
  );
}

async function accountJson(db: Db, budgetId: string, accountId: string) {
  const found = (await listAccountJson(db, budgetId)).find((a) => a.id === accountId);
  if (!found) throw new AppError(404, "NOT_FOUND", "Account not found");
  return found;
}

async function findAccount(db: Db, budgetId: string, accountId: string) {
  const [row] = await db
    .select()
    .from(budgetAccount)
    .where(and(eq(budgetAccount.id, accountId), eq(budgetAccount.budgetId, budgetId)));
  if (!row) throw new AppError(404, "NOT_FOUND", "Account not found");
  return row;
}

function assertLoanFields(
  type: AccountRow["type"],
  fields: { interestRate?: unknown; minimumPayment?: unknown; escrowAmount?: unknown },
) {
  const given = [fields.interestRate, fields.minimumPayment, fields.escrowAmount].some(
    (v) => v !== undefined && v !== null,
  );
  if (given && accountFamily(type) !== "loan") {
    throw new AppError(
      400,
      "BAD_REQUEST",
      "Interest rate, minimum payment and escrow only apply to loan accounts",
    );
  }
}

const optionalBigInt = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : BigInt(v);

export const listAccountsHandler: RouteHandler<typeof listAccounts, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  await loadBudgetAccess(c, budgetId);
  return c.json({ accounts: await listAccountJson(c.var.deps.db, budgetId) }, 200);
};

export const createAccountHandler: RouteHandler<typeof createAccount, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const body = c.req.valid("json");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId, { account: ["create"] });
  // Multi-currency arrives in phase 11 (see docs/deferred.md).
  if (body.currency && body.currency !== budget.currency) {
    throw new AppError(
      400,
      "BAD_REQUEST",
      `Accounts must use the budget's currency (${budget.currency}) for now`,
    );
  }
  assertLoanFields(body.type, body);

  const accountId = newId();
  await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ value: max(budgetAccount.sortOrder) })
      .from(budgetAccount)
      .where(eq(budgetAccount.budgetId, budgetId));
    await tx.insert(budgetAccount).values({
      id: accountId,
      budgetId,
      name: body.name,
      type: body.type,
      sortOrder: (last?.value ?? -1) + 1,
      currency: budget.currency,
      interestRate: body.interestRate ?? null,
      minimumPayment: optionalBigInt(body.minimumPayment) ?? null,
      escrowAmount: optionalBigInt(body.escrowAmount) ?? null,
    });
    if (hasPaymentCategory(body.type)) {
      await createPaymentCategory(tx, budgetId, accountId, body.name);
    }

    // Starting balance, like YNAB: money in budget accounts goes to Ready to Assign; credit-card
    // debt stays uncategorized until phase 7 turns it into debt on the payment category.
    const amount = BigInt(body.balance);
    const toReadyToAssign = isOnBudget(body.type) && amount >= 0n;
    await insertTransaction(tx, {
      budgetId,
      accountId,
      date: body.date,
      amount,
      currency: budget.currency,
      payeeId: await internalPayeeId(tx, budgetId, "starting_balance"),
      categoryId: toReadyToAssign
        ? await internalCategoryId(tx, budgetId, "ready_to_assign")
        : null,
      cleared: "cleared",
    });
  });
  return c.json(await accountJson(db, budgetId, accountId), 201);
};

export const updateAccountHandler: RouteHandler<typeof updateAccount, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const body = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { account: ["update"] });
  const account = await findAccount(db, budgetId, accountId);

  const type = body.type ?? account.type;
  if (accountFamily(type) !== accountFamily(account.type)) {
    // Cross-family changes move money in or out of the budget; see docs/deferred.md.
    throw new AppError(
      400,
      "BAD_REQUEST",
      "An account's type can only change within its family (cash, credit, loan or tracking)",
    );
  }
  assertLoanFields(type, body);

  await db.transaction(async (tx) => {
    await tx
      .update(budgetAccount)
      .set({
        name: body.name,
        note: body.note,
        type: body.type,
        interestRate: body.interestRate,
        minimumPayment: optionalBigInt(body.minimumPayment),
        escrowAmount: optionalBigInt(body.escrowAmount),
      })
      .where(eq(budgetAccount.id, accountId));
    // A payment category is named after its account.
    if (body.name !== undefined) {
      await tx
        .update(category)
        .set({ name: body.name })
        .where(eq(category.linkedAccountId, accountId));
    }
  });
  return c.json(await accountJson(db, budgetId, accountId), 200);
};

export const moveAccountHandler: RouteHandler<typeof moveAccount, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { beforeAccountId } = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { account: ["update"] });
  await db.transaction(async (tx) => {
    await findAccount(tx, budgetId, accountId);
    const rows = await tx
      .select({ id: budgetAccount.id })
      .from(budgetAccount)
      .where(eq(budgetAccount.budgetId, budgetId))
      .orderBy(asc(budgetAccount.sortOrder), asc(budgetAccount.id))
      .for("update");
    await writeOrder(
      tx,
      budgetAccount,
      reorder(
        rows.map((r) => r.id),
        accountId,
        beforeAccountId,
      ),
    );
  });
  return c.json({ accounts: await listAccountJson(db, budgetId) }, 200);
};

export const closeAccountHandler: RouteHandler<typeof closeAccount, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { date } = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { account: ["update"] });
  await db.transaction(async (tx) => {
    const account = await findAccount(tx, budgetId, accountId);
    if (account.closed) return;
    const working = (await accountBalances(tx, budgetId)).get(accountId)?.working ?? 0n;
    if (working !== 0n) {
      await insertTransaction(tx, {
        budgetId,
        accountId,
        date,
        amount: -working,
        currency: account.currency,
        payeeId: await internalPayeeId(tx, budgetId, "manual_balance_adjustment"),
        categoryId: isOnBudget(account.type)
          ? await internalCategoryId(tx, budgetId, "ready_to_assign")
          : null,
        cleared: "cleared",
      });
    }
    await tx.update(budgetAccount).set({ closed: true }).where(eq(budgetAccount.id, accountId));
    await tx.update(category).set({ hidden: true }).where(eq(category.linkedAccountId, accountId));
  });
  return c.json(await accountJson(db, budgetId, accountId), 200);
};

export const reopenAccountHandler: RouteHandler<typeof reopenAccount, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { account: ["update"] });
  await findAccount(db, budgetId, accountId);
  await db.transaction(async (tx) => {
    await tx.update(budgetAccount).set({ closed: false }).where(eq(budgetAccount.id, accountId));
    await tx.update(category).set({ hidden: false }).where(eq(category.linkedAccountId, accountId));
  });
  return c.json(await accountJson(db, budgetId, accountId), 200);
};

export const deleteAccountHandler: RouteHandler<typeof deleteAccount, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { account: ["delete"] });
  await findAccount(db, budgetId, accountId);
  const startingBalancePayee = await internalPayeeId(db, budgetId, "starting_balance");
  const [history] = await db
    .select({ id: transaction.id })
    .from(transaction)
    .where(
      and(
        eq(transaction.accountId, accountId),
        or(isNull(transaction.payeeId), ne(transaction.payeeId, startingBalancePayee)),
      ),
    )
    .limit(1);
  if (history) {
    throw new AppError(
      409,
      "ACCOUNT_HAS_HISTORY",
      "This account has transactions beyond its starting balance. Close it instead.",
    );
  }
  // Transactions and the payment category cascade.
  await db.delete(budgetAccount).where(eq(budgetAccount.id, accountId));
  return c.body(null, 204);
};

export const listAccountTransactionsHandler: RouteHandler<
  typeof listAccountTransactions,
  Env
> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId);
  await findAccount(db, budgetId, accountId);
  const rows = await db
    .select({
      id: transaction.id,
      date: transaction.date,
      amount: transaction.amount,
      currency: transaction.currency,
      payeeName: payee.name,
      categoryName: category.name,
      memo: transaction.memo,
      cleared: transaction.cleared,
    })
    .from(transaction)
    .leftJoin(payee, eq(payee.id, transaction.payeeId))
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(eq(transaction.accountId, accountId))
    .orderBy(desc(transaction.date), desc(transaction.createdAt), desc(transaction.id));
  return c.json({ transactions: rows.map((r) => ({ ...r, amount: r.amount.toString() })) }, 200);
};
