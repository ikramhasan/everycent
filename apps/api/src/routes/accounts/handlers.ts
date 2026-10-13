import { newId } from "@everycent/db";
import {
  budgetAccount,
  category,
  payee,
  scheduledTransaction,
  transaction,
} from "@everycent/db/schema";
import { accountFamily, hasPaymentCategory, isOnBudget } from "@everycent/engine";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, asc, eq, inArray, isNull, lte, max, ne, or, sql } from "drizzle-orm";
import { loadBudgetAccess } from "../../lib/budget-access";
import { AppError } from "../../lib/errors";
import {
  type AccountBalances,
  accountBalances,
  createPaymentCategory,
  type Db,
  insertStartingBalance,
  insertTransaction,
  internalCategoryId,
  internalPayeeId,
  serverToday,
  transferPayeeId,
  transferPayeeName,
  ZERO_BALANCES,
} from "../../lib/ledger";
import { reorder, writeOrder } from "../../lib/ordering";
import { enterDueScheduled, entryDate } from "../../lib/scheduled";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type {
  closeAccount,
  createAccount,
  deleteAccount,
  listAccounts,
  moveAccount,
  reconcileAccount,
  reopenAccount,
  updateAccount,
} from "./routes";

type Env = AppEnv & AuthedEnv;
type AccountRow = typeof budgetAccount.$inferSelect;

function toAccountJson(
  a: AccountRow,
  balances: AccountBalances,
  paymentCategoryId: string | null,
  hasHistory: boolean,
) {
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
    hasHistory,
    balances: {
      cleared: balances.cleared.toString(),
      uncleared: balances.uncleared.toString(),
      working: balances.working.toString(),
    },
    lastReconciledAt: a.lastReconciledAt?.toISOString() ?? null,
  };
}

async function listAccountJson(db: Db, budgetId: string, today: string) {
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
  const balances = await accountBalances(db, budgetId, today);
  const startingBalancePayee = await internalPayeeId(db, budgetId, "starting_balance");
  const withHistory = await db
    .selectDistinct({ accountId: transaction.accountId })
    .from(transaction)
    .where(
      and(
        eq(transaction.budgetId, budgetId),
        or(isNull(transaction.payeeId), ne(transaction.payeeId, startingBalancePayee)),
      ),
    );
  const history = new Set(withHistory.map((r) => r.accountId));
  return accounts.map((a) =>
    toAccountJson(
      a,
      balances.get(a.id) ?? ZERO_BALANCES,
      paymentByAccount.get(a.id) ?? null,
      history.has(a.id),
    ),
  );
}

async function accountJson(db: Db, budgetId: string, accountId: string, today = serverToday()) {
  const found = (await listAccountJson(db, budgetId, today)).find((a) => a.id === accountId);
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
  const query = c.req.valid("query");
  const today = query.today ?? serverToday();
  await loadBudgetAccess(c, budgetId);
  if (query.today)
    await enterDueScheduled(c.var.deps.db, budgetId, entryDate(c.var.deps, query.today));
  return c.json({ accounts: await listAccountJson(c.var.deps.db, budgetId, today) }, 200);
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
    await transferPayeeId(tx, { id: accountId, budgetId, name: body.name });

    await insertStartingBalance(tx, {
      budgetId,
      accountId,
      type: body.type,
      amount: BigInt(body.balance),
      currency: budget.currency,
      date: body.date,
    });
  });
  return c.json(await accountJson(db, budgetId, accountId, body.date), 201);
};

export const updateAccountHandler: RouteHandler<typeof updateAccount, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { workingBalance, date = serverToday(), ...body } = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(
    c,
    budgetId,
    workingBalance === undefined
      ? { account: ["update"] }
      : { account: ["update"], transaction: ["create"] },
  );
  const account = await findAccount(db, budgetId, accountId);
  if (workingBalance !== undefined) {
    assertAdjustable(account);
    // A closed account's Edit Account has no Working Balance in YNAB.
    if (account.closed) {
      throw new AppError(400, "ACCOUNT_CLOSED", "Reopen the account to change its balance");
    }
  }

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
    const fields = {
      name: body.name,
      note: body.note,
      type: body.type,
      interestRate: body.interestRate,
      minimumPayment: optionalBigInt(body.minimumPayment),
      escrowAmount: optionalBigInt(body.escrowAmount),
    };
    // Drizzle refuses an update with nothing to set (a working balance alone).
    if (Object.values(fields).some((v) => v !== undefined)) {
      await tx.update(budgetAccount).set(fields).where(eq(budgetAccount.id, accountId));
    }
    // A payment category and the transfer payee are named after their account.
    if (body.name !== undefined) {
      await tx
        .update(category)
        .set({ name: body.name })
        .where(eq(category.linkedAccountId, accountId));
      await tx
        .update(payee)
        .set({ name: transferPayeeName(body.name) })
        .where(eq(payee.transferAccountId, accountId));
    }
    if (workingBalance !== undefined) {
      const working = (await accountBalances(tx, budgetId, date)).get(accountId)?.working ?? 0n;
      const difference = BigInt(workingBalance) - working;
      if (difference !== 0n) {
        // YNAB's Edit Account (2026-10-11, "Onboarding Check"): a cleared Manual Balance
        // Adjustment with no memo, from Ready to Assign on budget accounts, cards included.
        await insertAdjustment(tx, account, {
          date,
          amount: difference,
          kind: "manual_balance_adjustment",
          memo: "",
          cleared: "cleared",
        });
      }
    }
  });
  return c.json(await accountJson(db, budgetId, accountId, date), 200);
};

/** YNAB has no Reconcile or Working Balance for loans (their balance follows the loan's terms). */
function assertAdjustable(account: AccountRow) {
  if (accountFamily(account.type) === "loan") {
    throw new AppError(400, "BAD_REQUEST", "Loan accounts can't be reconciled or adjusted");
  }
}

/** A balance adjustment in `account`; budget accounts take it from Ready to Assign. */
async function insertAdjustment(
  tx: Db,
  account: AccountRow,
  input: {
    date: string;
    amount: bigint;
    kind: "manual_balance_adjustment" | "reconciliation_balance_adjustment";
    memo: string;
    cleared: "cleared" | "reconciled";
  },
) {
  await insertTransaction(tx, {
    budgetId: account.budgetId,
    accountId: account.id,
    date: input.date,
    amount: input.amount,
    currency: account.currency,
    payeeId: await internalPayeeId(tx, account.budgetId, input.kind),
    memo: input.memo,
    categoryId: isOnBudget(account.type)
      ? await internalCategoryId(tx, account.budgetId, "ready_to_assign")
      : null,
    cleared: input.cleared,
  });
}

export const reconcileAccountHandler: RouteHandler<typeof reconcileAccount, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { balance, date } = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["create", "update"] });
  await db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(budgetAccount)
      .where(and(eq(budgetAccount.id, accountId), eq(budgetAccount.budgetId, budgetId)))
      .for("update");
    if (!account) throw new AppError(404, "NOT_FOUND", "Account not found");
    assertAdjustable(account);
    const cleared = (await accountBalances(tx, budgetId, date)).get(accountId)?.cleared ?? 0n;
    const difference = BigInt(balance) - cleared;
    if (difference !== 0n) {
      // YNAB (2026-10-11, "Onboarding Check"): dated today, reconciled, Inflow: Ready to Assign
      // on budget accounts (a card's too), none on tracking accounts.
      await insertAdjustment(tx, account, {
        date,
        amount: difference,
        kind: "reconciliation_balance_adjustment",
        memo: "Entered automatically by everycent",
        cleared: "reconciled",
      });
    }
    // Future-dated transactions aren't in the cleared balance yet, so they stay unlocked.
    await tx
      .update(transaction)
      .set({ cleared: "reconciled" })
      .where(
        and(
          eq(transaction.accountId, accountId),
          eq(transaction.cleared, "cleared"),
          lte(transaction.date, date),
        ),
      );
    await tx
      .update(budgetAccount)
      .set({ lastReconciledAt: sql`now()` })
      .where(eq(budgetAccount.id, accountId));
  });
  return c.json(await accountJson(db, budgetId, accountId, date), 200);
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
  return c.json({ accounts: await listAccountJson(db, budgetId, serverToday()) }, 200);
};

export const closeAccountHandler: RouteHandler<typeof closeAccount, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { date } = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { account: ["update"] });
  await db.transaction(async (tx) => {
    const account = await findAccount(tx, budgetId, accountId);
    if (account.closed) return;
    const working = (await accountBalances(tx, budgetId, date)).get(accountId)?.working ?? 0n;
    if (working !== 0n) {
      await insertTransaction(tx, {
        budgetId,
        accountId,
        date,
        amount: -working,
        currency: account.currency,
        payeeId: await internalPayeeId(tx, budgetId, "manual_balance_adjustment"),
        memo: "Closed Account",
        categoryId: isOnBudget(account.type)
          ? await internalCategoryId(tx, budgetId, "ready_to_assign")
          : null,
        cleared: "cleared",
      });
    }
    // The payment category stays visible with whatever is set aside (YNAB, 2026-10-11: Card Y
    // kept $6 after closing); hiding it is up to the user.
    await tx.update(budgetAccount).set({ closed: true }).where(eq(budgetAccount.id, accountId));
  });
  return c.json(await accountJson(db, budgetId, accountId, date), 200);
};

export const reopenAccountHandler: RouteHandler<typeof reopenAccount, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { account: ["update"] });
  await findAccount(db, budgetId, accountId);
  await db.update(budgetAccount).set({ closed: false }).where(eq(budgetAccount.id, accountId));
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
  await db.transaction(async (tx) => {
    // Schedules that transfer to it would turn into payments to nobody, so they go too.
    // Transactions, its own schedules and the payment category cascade.
    await tx
      .delete(scheduledTransaction)
      .where(
        inArray(
          scheduledTransaction.payeeId,
          tx.select({ id: payee.id }).from(payee).where(eq(payee.transferAccountId, accountId)),
        ),
      );
    await tx.delete(budgetAccount).where(eq(budgetAccount.id, accountId));
  });
  return c.body(null, 204);
};
