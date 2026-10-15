import { budgetAccount, budget as budgetTable, transaction } from "@everycent/db/schema";
import { accountFamily, isOnBudget, monthEndBalances, monthOf } from "@everycent/engine";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { loadBudgetAccess } from "../../lib/budget-access";
import { AppError } from "../../lib/errors";
import {
  type Db,
  insertTransaction,
  internalCategoryId,
  serverToday,
  transferPayeeId,
} from "../../lib/ledger";
import { type LoanState, loanStates, setLoanCharge } from "../../lib/loans";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import { insertOtherSide } from "../transactions/rules";
import { accountJson } from "./handlers";
import type {
  dismissLoanBanner,
  getLoanActivity,
  recordLoanPayment,
  setLoanCharge as setLoanChargeRoute,
} from "./routes";

type Env = AppEnv & AuthedEnv;
type AccountRow = typeof budgetAccount.$inferSelect;

async function findLoan(db: Db, budgetId: string, accountId: string) {
  const [account] = await db
    .select()
    .from(budgetAccount)
    .where(and(eq(budgetAccount.id, accountId), eq(budgetAccount.budgetId, budgetId)));
  if (!account) throw new AppError(404, "NOT_FOUND", "Account not found");
  if (accountFamily(account.type) !== "loan") {
    throw new AppError(400, "BAD_REQUEST", "Not a loan account");
  }
  return account;
}

async function loanState(db: Db, account: AccountRow, today: string) {
  const state = (await loanStates(db, [account], today)).get(account.id);
  if (!state) throw new Error(`Loan state missing for ${account.id}`);
  return state;
}

/** The tracking liability `loan` was made from, as month-end balances (or null). */
async function originalHistory(db: Db, loan: AccountRow) {
  const [original] = await db
    .select({ id: budgetAccount.id })
    .from(budgetAccount)
    .where(eq(budgetAccount.migratedToAccountId, loan.id));
  if (!original) return null;
  const entries = await db
    .select({ date: transaction.date, amount: transaction.amount })
    .from(transaction)
    .where(eq(transaction.accountId, original.id));
  return {
    accountId: original.id,
    months: monthEndBalances(entries).map((m) => ({
      month: m.month,
      endBalance: m.endBalance.toString(),
    })),
  };
}

/** The loan page's banners: the simulator one is dismissed plan-wide, the paid-off one per loan. */
function bannersJson(budget: { loanSimulatorBannerDismissed: boolean }, account: AccountRow) {
  return {
    simulatorDismissed: budget.loanSimulatorBannerDismissed,
    paidOffDismissed: account.paidOffBannerDismissed,
  };
}

async function loanActivity(
  db: Db,
  budget: { loanSimulatorBannerDismissed: boolean },
  account: AccountRow,
  today: string,
) {
  return {
    ...activityJson(await loanState(db, account, today)),
    banners: bannersJson(budget, account),
    originalHistory: await originalHistory(db, account),
  };
}

function activityJson(state: LoanState) {
  const charge = (
    month: string,
    kind: "interest" | "escrow",
    c: LoanState["months"][0]["interest"],
  ) => ({
    total: c.total.toString(),
    applied: c.applied.toString(),
    status: c.status,
    editedAt: state.editedAt.get(`${month}:${kind}`)?.toISOString() ?? null,
  });
  return {
    months: state.months.map((m) => ({
      month: m.month,
      startBalance: m.startBalance.toString(),
      endBalance: m.endBalance.toString(),
      payments: m.payments.toString(),
      interest: charge(m.month, "interest", m.interest),
      escrow: charge(m.month, "escrow", m.escrow),
      transactions: state.transactions
        .filter((t) => monthOf(t.date) === m.month)
        .map((t) => ({ ...t, amount: t.amount.toString() })),
    })),
    terms: [...state.terms]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((t) => ({
        month: t.month,
        interestRate: t.interestRate,
        minimumPayment: t.minimumPayment?.toString() ?? null,
        escrowAmount: t.escrowAmount?.toString() ?? null,
      })),
  };
}

export const getLoanActivityHandler: RouteHandler<typeof getLoanActivity, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { today = serverToday() } = c.req.valid("query");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId);
  const account = await findLoan(db, budgetId, accountId);
  return c.json(await loanActivity(db, budget, account, today), 200);
};

export const dismissLoanBannerHandler: RouteHandler<typeof dismissLoanBanner, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { banner } = c.req.valid("json");
  const { db } = c.var.deps;
  // Anyone on the plan can dismiss them, as anyone sees them.
  const { budget } = await loadBudgetAccess(c, budgetId);
  const account = await findLoan(db, budgetId, accountId);
  if (banner === "simulator") {
    await db
      .update(budgetTable)
      .set({ loanSimulatorBannerDismissed: true })
      .where(eq(budgetTable.id, budgetId));
  } else {
    await db
      .update(budgetAccount)
      .set({ paidOffBannerDismissed: true })
      .where(eq(budgetAccount.id, account.id));
  }
  return c.json(
    {
      simulatorDismissed: budget.loanSimulatorBannerDismissed || banner === "simulator",
      paidOffDismissed: account.paidOffBannerDismissed || banner === "paidOff",
    },
    200,
  );
};

export const setLoanChargeHandler: RouteHandler<typeof setLoanChargeRoute, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { month, kind, amount, today } = c.req.valid("json");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId, { transaction: ["update"] });
  const account = await findLoan(db, budgetId, accountId);
  const value = BigInt(amount);
  if (value < 0n) throw new AppError(400, "BAD_REQUEST", "Enter a charge of zero or more");
  const months = (await loanState(db, account, today)).months;
  // YNAB's Add Interest offers the loan's first month through this month.
  if (!months.some((m) => m.month === month)) {
    throw new AppError(400, "BAD_REQUEST", "That month is outside the loan's activity");
  }
  await setLoanCharge(db, account, { month, kind, amount: value, status: "edited" });
  return c.json(await loanActivity(db, budget, account, today), 200);
};

export const recordLoanPaymentHandler: RouteHandler<typeof recordLoanPayment, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { fromAccountId, amount, date, memo } = c.req.valid("json");
  const { today = serverToday() } = c.req.valid("query");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["create"] });
  const value = BigInt(amount);
  if (value <= 0n) throw new AppError(400, "BAD_REQUEST", "Enter a payment amount");
  await db.transaction(async (tx) => {
    const loan = await findLoan(tx, budgetId, accountId);
    const [from] = await tx
      .select()
      .from(budgetAccount)
      .where(and(eq(budgetAccount.id, fromAccountId), eq(budgetAccount.budgetId, budgetId)));
    if (!from || !isOnBudget(from.type)) {
      throw new AppError(400, "BAD_REQUEST", "Pay from a cash or credit account in this budget");
    }
    if (loan.closed || from.closed) {
      throw new AppError(400, "ACCOUNT_CLOSED", "Reopen the account to record a payment");
    }
    // YNAB (2026-10-13): the paying side is uncleared and comes out of the paired category, or
    // Uncategorized; the loan's side, entered from the loan, is cleared.
    const payingId = await insertTransaction(tx, {
      budgetId,
      accountId: from.id,
      date,
      amount: -value,
      currency: from.currency,
      payeeId: await transferPayeeId(tx, loan),
      categoryId:
        loan.pairedCategoryId ?? (await internalCategoryId(tx, budgetId, "uncategorized")),
      memo,
      cleared: "uncleared",
    });
    await insertOtherSide(tx, { id: payingId, budgetId, date, amount: -value, memo }, from, loan, {
      cleared: "cleared",
    });
  });
  // Balances as of the user's today, not the payment's date (which may be back-dated).
  return c.json(await accountJson(db, budgetId, accountId, today), 201);
};
