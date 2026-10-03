import { sql } from "@everycent/db";
import {
  budgetAccount,
  category,
  categoryAssignment,
  categoryGroup,
  categoryTarget,
  moneyMove,
  subTransaction,
  transaction,
  user,
} from "@everycent/db/schema";
import {
  ACCOUNT_TYPES,
  type AutoAssignOption,
  accountFamily,
  autoAssignAmounts,
  type BudgetMonth,
  budgetMonthRange,
  type CardActivity,
  type CategoryMonth,
  type CurrencyCode,
  categoryMonth,
  categoryOverspending,
  fundedCardSpending,
  isOnBudget,
  type MonthAmount,
  type MonthFigures,
  monthBounds,
  monthOf,
  readyToAssign,
  type TargetNeed,
  targetNeed,
} from "@everycent/engine";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, max, min, or } from "drizzle-orm";
import { type AnyPgColumn, alias } from "drizzle-orm/pg-core";
import { adjustAssigned, assignedAmount, logMove } from "../../lib/assignments";
import { loadBudgetAccess } from "../../lib/budget-access";
import { AppError } from "../../lib/errors";
import { accountBalances, type Db, internalCategoryId, serverToday } from "../../lib/ledger";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type { assignCategory, autoAssign, getBudgetMonth, listMoves, moveMoney } from "./routes";

type Env = AppEnv & AuthedEnv;

const monthKey = (date: AnyPgColumn) => sql<string>`to_char(${date}, 'YYYY-MM')`;
// Postgres returns numeric sums as strings; BigInt parses them exactly.
const total = (amount: AnyPgColumn) => sql<string>`sum(${amount})`;
const CREDIT_TYPES = ACCOUNT_TYPES.filter((t) => accountFamily(t) === "credit");
const BUDGET_TYPES = ACCOUNT_TYPES.filter(isOnBudget);
/** The part of `amount`'s sum on credit accounts (YNAB's Credit Spending). */
const creditTotal = (amount: AnyPgColumn) =>
  sql<string>`coalesce(sum(${amount}) filter (where ${inArray(budgetAccount.type, CREDIT_TYPES)}), 0)`;

/**
 * Each category's activity per month up to `cutoff` (and the part of it on credit accounts), and its
 * assigned amounts in every month (money assigned in later months counts toward Ready to Assign).
 */
async function categoryHistory(db: Db, budgetId: string, cutoff: string) {
  const rows = await db
    .select({
      categoryId: transaction.categoryId,
      month: monthKey(transaction.date),
      amount: total(transaction.amount),
      credit: creditTotal(transaction.amount),
    })
    .from(transaction)
    .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
    .where(
      and(
        eq(transaction.budgetId, budgetId),
        isNotNull(transaction.categoryId),
        lte(transaction.date, cutoff),
      ),
    )
    .groupBy(transaction.categoryId, monthKey(transaction.date));
  // A split's own category is null; its lines carry the categories.
  const lines = await db
    .select({
      categoryId: subTransaction.categoryId,
      month: monthKey(transaction.date),
      amount: total(subTransaction.amount),
      credit: creditTotal(subTransaction.amount),
    })
    .from(subTransaction)
    .innerJoin(transaction, eq(transaction.id, subTransaction.transactionId))
    .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
    .where(
      and(
        eq(transaction.budgetId, budgetId),
        isNotNull(subTransaction.categoryId),
        lte(transaction.date, cutoff),
      ),
    )
    .groupBy(subTransaction.categoryId, monthKey(transaction.date));
  const assigned = await db
    .select({
      categoryId: categoryAssignment.categoryId,
      month: monthKey(categoryAssignment.month),
      amount: categoryAssignment.amount,
    })
    .from(categoryAssignment)
    .where(eq(categoryAssignment.budgetId, budgetId));

  const history = new Map<string, MonthFigures[]>();
  const push = (categoryId: string | null, entry: MonthFigures) => {
    if (!categoryId) return;
    const list = history.get(categoryId) ?? [];
    list.push(entry);
    history.set(categoryId, list);
  };
  for (const r of [...rows, ...lines]) {
    push(r.categoryId, {
      month: r.month,
      assigned: 0n,
      activity: BigInt(r.amount),
      creditActivity: BigInt(r.credit),
    });
  }
  for (const r of assigned)
    push(r.categoryId, { month: r.month, assigned: r.amount, activity: 0n });
  return history;
}

/**
 * Every category's history up to `cutoff`, payment categories' Funded Spending included (YNAB moves
 * the funded part of card spending into the card's payment category).
 */
async function budgetHistory(db: Db, budgetId: string, cutoff: string) {
  const history = await categoryHistory(db, budgetId, cutoff);
  const rows = await db
    .select({
      id: category.id,
      accountId: category.linkedAccountId,
      internalKind: category.internalKind,
    })
    .from(category)
    .where(eq(category.budgetId, budgetId));
  const byAccount = new Map(rows.flatMap((p) => (p.accountId ? [[p.accountId, p.id]] : [])));
  // Card inflows to Ready to Assign (statement credits) only lower the card's balance (YNAB: "It
  // also won't change the amount you have set aside for payment"); uncategorized card spending is
  // credit overspending in Uncategorized. Neither moves payment money.
  const skip = new Set(rows.filter((r) => r.accountId || r.internalKind).map((r) => r.id));
  const creditOverspent = await addFundedSpending(db, budgetId, cutoff, history, byAccount, skip);
  await addPayments(db, budgetId, cutoff, history, byAccount);
  return { history, paymentAccounts: byAccount, creditOverspent };
}

/**
 * Adds each payment category's Payments Made to `history`: money moved into a card from a budget
 * account comes out of the card's payment category in the payment's month (YNAB, checked in its
 * web app on 2026-10-03: Citi $14.00 → $8.00 for a $6.00 payment from Wallet; paying more than
 * is set aside leaves it negative). Money moved out of a card to a budget account (a cash advance)
 * only raises what's owed. Transfers from tracking accounts are skipped (docs/verify.md).
 */
async function addPayments(
  db: Db,
  budgetId: string,
  cutoff: string,
  history: Map<string, MonthFigures[]>,
  paymentCategoryByAccount: ReadonlyMap<string, string>,
) {
  const other = alias(transaction, "other_side");
  const otherAccount = alias(budgetAccount, "other_account");
  const otherLine = alias(subTransaction, "other_line");
  const otherLineTx = alias(transaction, "other_line_tx");
  const otherLineAccount = alias(budgetAccount, "other_line_account");
  // Inflows to a card whose other side (a transaction or a split's line) is in a budget account.
  const rows = await db
    .select({
      accountId: transaction.accountId,
      month: monthKey(transaction.date),
      amount: total(transaction.amount),
    })
    .from(transaction)
    .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
    .leftJoin(other, eq(other.id, transaction.transferTransactionId))
    .leftJoin(otherAccount, eq(otherAccount.id, other.accountId))
    .leftJoin(otherLine, eq(otherLine.id, transaction.transferSubTransactionId))
    .leftJoin(otherLineTx, eq(otherLineTx.id, otherLine.transactionId))
    .leftJoin(otherLineAccount, eq(otherLineAccount.id, otherLineTx.accountId))
    .where(
      and(
        eq(transaction.budgetId, budgetId),
        inArray(budgetAccount.type, CREDIT_TYPES),
        gt(transaction.amount, 0n),
        lte(transaction.date, cutoff),
        or(inArray(otherAccount.type, BUDGET_TYPES), inArray(otherLineAccount.type, BUDGET_TYPES)),
      ),
    )
    .groupBy(transaction.accountId, monthKey(transaction.date));
  for (const r of rows) {
    const paymentId = paymentCategoryByAccount.get(r.accountId);
    if (!paymentId) continue;
    const amount = -BigInt(r.amount);
    const list = history.get(paymentId) ?? [];
    list.push({ month: r.month, assigned: 0n, activity: amount, payments: amount });
    history.set(paymentId, list);
  }
}

/** Each category's net activity per month on each credit account, up to `cutoff`. */
async function cardActivity(db: Db, budgetId: string, cutoff: string) {
  const onCard = and(
    eq(transaction.budgetId, budgetId),
    inArray(budgetAccount.type, CREDIT_TYPES),
    lte(transaction.date, cutoff),
  );
  const rows = await db
    .select({
      categoryId: transaction.categoryId,
      month: monthKey(transaction.date),
      accountId: transaction.accountId,
      amount: total(transaction.amount),
    })
    .from(transaction)
    .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
    .where(and(onCard, isNotNull(transaction.categoryId)))
    .groupBy(transaction.categoryId, monthKey(transaction.date), transaction.accountId);
  const lines = await db
    .select({
      categoryId: subTransaction.categoryId,
      month: monthKey(transaction.date),
      accountId: transaction.accountId,
      amount: total(subTransaction.amount),
    })
    .from(subTransaction)
    .innerJoin(transaction, eq(transaction.id, subTransaction.transactionId))
    .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
    .where(and(onCard, isNotNull(subTransaction.categoryId)))
    .groupBy(subTransaction.categoryId, monthKey(transaction.date), transaction.accountId);

  // categoryId → month → accountId → amount (a card's transactions and split lines added up).
  const byCategory = new Map<string, Map<BudgetMonth, Map<string, bigint>>>();
  for (const r of [...rows, ...lines]) {
    if (!r.categoryId) continue;
    const months = byCategory.get(r.categoryId) ?? new Map<BudgetMonth, Map<string, bigint>>();
    const cards = months.get(r.month) ?? new Map<string, bigint>();
    cards.set(r.accountId, (cards.get(r.accountId) ?? 0n) + BigInt(r.amount));
    months.set(r.month, cards);
    byCategory.set(r.categoryId, months);
  }
  return byCategory;
}

/**
 * Adds each payment category's Funded Spending to `history`: for every spending category and month
 * with card activity, what moved into (or, for returns, out of) each card's payment category. What
 * a category has before its card activity doesn't depend on funding, so months are independent.
 */
async function addFundedSpending(
  db: Db,
  budgetId: string,
  cutoff: string,
  history: Map<string, MonthFigures[]>,
  paymentCategoryByAccount: ReadonlyMap<string, string>,
  skip: ReadonlySet<string>,
) {
  const cards = await cardActivity(db, budgetId, cutoff);
  const funded = new Map<string, MonthFigures[]>();
  /** accountId → month → that card's unfunded spending (credit overspending, positive). */
  const unfunded = new Map<string, Map<BudgetMonth, bigint>>();
  for (const [categoryId, months] of cards) {
    if (skip.has(categoryId)) continue;
    const entries = history.get(categoryId) ?? [];
    for (const [month, byAccount] of months) {
      const figures = categoryMonth(entries, month);
      const cash = figures.carried + figures.assigned + figures.cashActivity;
      const activity: CardActivity[] = [...byAccount].map(([accountId, amount]) => ({
        accountId,
        amount,
      }));
      for (const [accountId, amount] of fundedCardSpending(cash, activity)) {
        const spent = -(byAccount.get(accountId) ?? 0n);
        if (spent > amount) {
          const months = unfunded.get(accountId) ?? new Map<BudgetMonth, bigint>();
          months.set(month, (months.get(month) ?? 0n) + spent - amount);
          unfunded.set(accountId, months);
        }
        const paymentId = paymentCategoryByAccount.get(accountId);
        if (!paymentId || amount === 0n) continue;
        const list = funded.get(paymentId) ?? [];
        list.push({ month, assigned: 0n, activity: amount, fundedSpending: amount });
        funded.set(paymentId, list);
      }
    }
  }
  for (const [paymentId, entries] of funded) {
    history.set(paymentId, [...(history.get(paymentId) ?? []), ...entries]);
  }
  return unfunded;
}

const ZERO: CategoryMonth = {
  carried: 0n,
  assigned: 0n,
  activity: 0n,
  cashActivity: 0n,
  creditActivity: 0n,
  fundedSpending: 0n,
  payments: 0n,
  available: 0n,
  cashOverspent: 0n,
  creditOverspent: 0n,
};

function addTo(sum: CategoryMonth, n: CategoryMonth): CategoryMonth {
  return {
    carried: sum.carried + n.carried,
    assigned: sum.assigned + n.assigned,
    activity: sum.activity + n.activity,
    cashActivity: sum.cashActivity + n.cashActivity,
    creditActivity: sum.creditActivity + n.creditActivity,
    fundedSpending: sum.fundedSpending + n.fundedSpending,
    payments: sum.payments + n.payments,
    cashOverspent: sum.cashOverspent + n.cashOverspent,
    creditOverspent: sum.creditOverspent + n.creditOverspent,
    available: sum.available + n.available,
  };
}

const totalsJson = (n: CategoryMonth) => ({
  assigned: n.assigned.toString(),
  activity: n.activity.toString(),
  cashActivity: n.cashActivity.toString(),
  creditActivity: n.creditActivity.toString(),
  available: n.available.toString(),
  cashOverspent: n.cashOverspent.toString(),
  creditOverspent: n.creditOverspent.toString(),
});

/** The months the budget shows, as of the user's `today`. */
async function monthRange(db: Db, budgetId: string, today: string) {
  const [earliest] = await db
    .select({ date: min(transaction.date) })
    .from(transaction)
    .where(eq(transaction.budgetId, budgetId));
  const [latest] = await db
    .select({ month: max(categoryAssignment.month) })
    .from(categoryAssignment)
    .where(eq(categoryAssignment.budgetId, budgetId));
  return budgetMonthRange({
    current: monthOf(today),
    earliestTransaction: earliest?.date ? monthOf(earliest.date) : null,
    latestAssigned: latest?.month ? monthOf(latest.month) : null,
  });
}

/** Refuses months the budget doesn't show. */
async function assertMonthInRange(db: Db, budgetId: string, month: BudgetMonth, today: string) {
  const { first, last } = await monthRange(db, budgetId, today);
  if (month < first || month > last) {
    throw new AppError(400, "MONTH_OUT_OF_RANGE", `Money can be assigned from ${first} to ${last}`);
  }
}

/**
 * A category money can be assigned to or moved from: a listed category, or Ready to Assign's
 * internal one (the other end of assigning and removing money).
 */
async function moneyCategory(db: Db, budgetId: string, categoryId: string) {
  const [row] = await db
    .select({ id: category.id, internalKind: category.internalKind })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.budgetId, budgetId)));
  if (!row || row.internalKind === "uncategorized") {
    throw new AppError(404, "NOT_FOUND", "Category not found");
  }
  return { id: row.id, readyToAssign: row.internalKind === "ready_to_assign" };
}

/** The budget screen's numbers for `month`, as of the user's `today`. */
export async function budgetMonthJson(
  db: Db,
  budget: { id: string; currency: CurrencyCode },
  month: BudgetMonth,
  today: string,
) {
  const budgetId = budget.id;
  const { end } = monthBounds(month);
  // Transactions dated after the user's today don't count yet.
  const cutoff = end < today ? end : today;
  const { history, paymentAccounts, creditOverspent } = await budgetHistory(db, budgetId, cutoff);

  const range = await monthRange(db, budgetId, today);

  const categories = await db
    .select({
      id: category.id,
      groupId: category.groupId,
      hidden: category.hidden,
      internalKind: category.internalKind,
      groupHidden: categoryGroup.hidden,
    })
    .from(category)
    .innerJoin(categoryGroup, eq(categoryGroup.id, category.groupId))
    .where(eq(category.budgetId, budgetId));

  const targetRows = await db
    .select()
    .from(categoryTarget)
    .where(eq(categoryTarget.budgetId, budgetId));
  const targets = new Map(targetRows.map((t) => [t.categoryId, t]));

  const listed: {
    categoryId: string;
    figures: CategoryMonth;
    auto: Record<AutoAssignOption, bigint>;
    need: TargetNeed | null;
  }[] = [];
  const groups = new Map<string, CategoryMonth>();
  let hidden = ZERO;
  let uncategorized: CategoryMonth | null = null;
  const income: MonthAmount[] = [];
  const assigned: MonthAmount[] = [];
  const overspent: MonthAmount[] = [];
  for (const cat of categories) {
    const entries = history.get(cat.id) ?? [];
    if (cat.internalKind === "ready_to_assign") {
      income.push(...entries.map((e) => ({ month: e.month, amount: e.activity })));
      continue;
    }
    // Cash overspending comes out of the next month's Ready to Assign, hidden categories and
    // Uncategorized included; credit overspending is new card debt and doesn't.
    overspent.push(...categoryOverspending(entries));
    assigned.push(...entries.map((e) => ({ month: e.month, amount: e.assigned })));
    const figures = categoryMonth(entries, month);
    if (cat.internalKind === "uncategorized") {
      // YNAB lists it only in months with uncategorized transactions.
      if (entries.some((e) => e.month === month)) uncategorized = figures;
      continue;
    }
    const target = targets.get(cat.id);
    listed.push({
      categoryId: cat.id,
      figures,
      auto: autoAssignAmounts(entries, month),
      need: target
        ? targetNeed(
            entries,
            { ...target, startMonth: monthOf(target.startMonth) },
            month,
            monthOf(today),
          )
        : null,
    });
    if (cat.hidden || cat.groupHidden) {
      hidden = addTo(hidden, figures);
    } else {
      groups.set(cat.groupId, addTo(groups.get(cat.groupId) ?? ZERO, figures));
    }
  }
  const groupRows = await db
    .select({ id: categoryGroup.id })
    .from(categoryGroup)
    .where(and(eq(categoryGroup.budgetId, budgetId), eq(categoryGroup.internal, false)));

  // Each card's payment details: what's owed at the end of the month (up to today) against what's
  // set aside, and how much of the shortfall is this month's credit overspending.
  const balances = await accountBalances(db, budgetId, cutoff);
  const { start } = monthBounds(month);
  // The card's month in its register: what it owed before, and its outflows and inflows since.
  const cardMonth = await db
    .select({
      accountId: transaction.accountId,
      prior: sql<string>`coalesce(sum(${transaction.amount}) filter (where ${transaction.date} < ${start}), 0)`,
      outflows: sql<string>`coalesce(sum(${transaction.amount}) filter (where ${transaction.date} >= ${start} and ${transaction.amount} < 0), 0)`,
      inflows: sql<string>`coalesce(sum(${transaction.amount}) filter (where ${transaction.date} >= ${start} and ${transaction.amount} > 0), 0)`,
    })
    .from(transaction)
    .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
    .where(
      and(
        eq(transaction.budgetId, budgetId),
        inArray(budgetAccount.type, CREDIT_TYPES),
        lte(transaction.date, cutoff),
      ),
    )
    .groupBy(transaction.accountId);
  const register = new Map(cardMonth.map((r) => [r.accountId, r]));
  const accountOf = new Map([...paymentAccounts].map(([accountId, id]) => [id, accountId]));
  const paymentJson = (categoryId: string, figures: CategoryMonth) => {
    const accountId = accountOf.get(categoryId);
    if (!accountId) return null;
    const balance = balances.get(accountId)?.working ?? 0n;
    const owed = balance < 0n ? -balance : 0n;
    // A negative Available is overpayment (cash overspending, shown red); what's underfunded is
    // the debt the money set aside doesn't reach.
    const setAside = figures.available > 0n ? figures.available : 0n;
    const underfunded = owed > setAside ? owed - setAside : 0n;
    const overspentNow = creditOverspent.get(accountId)?.get(month) ?? 0n;
    const fromOverspending = overspentNow < underfunded ? overspentNow : underfunded;
    const reg = register.get(accountId);
    return {
      balance: balance.toString(),
      priorBalance: reg?.prior ?? "0",
      spendingAndOutflows: reg?.outflows ?? "0",
      paymentsAndInflows: reg?.inflows ?? "0",
      underfunded: underfunded.toString(),
      overspentCategories: fromOverspending.toString(),
      fundedSpending: figures.fundedSpending.toString(),
      paymentsMade: figures.payments.toString(),
    };
  };

  const rta = readyToAssign({ month, income, assigned, overspent });
  const future = new Map<BudgetMonth, bigint>();
  for (const a of assigned) {
    if (a.month > month) future.set(a.month, (future.get(a.month) ?? 0n) + a.amount);
  }

  return {
    month,
    currency: budget.currency,
    firstMonth: range.first,
    lastMonth: range.last,
    readyToAssign: rta.readyToAssign.toString(),
    assignedInFuture: rta.assignedInFuture.toString(),
    futureMonths: [...future]
      .filter(([, amount]) => amount !== 0n)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([m, amount]) => ({ month: m, assigned: amount.toString() })),
    categories: listed.map((l) => ({
      categoryId: l.categoryId,
      ...totalsJson(l.figures),
      payment: paymentJson(l.categoryId, l.figures),
      target: l.need && {
        needed: l.need.needed.toString(),
        funded: l.need.funded.toString(),
        underfunded: l.need.underfunded.toString(),
        dueDate: l.need.dueDate,
      },
      autoAssign: Object.fromEntries(
        Object.entries(l.auto).map(([option, amount]) => [option, amount.toString()]),
      ) as Record<AutoAssignOption, string>,
    })),
    groups: groupRows.map((g) => ({ groupId: g.id, ...totalsJson(groups.get(g.id) ?? ZERO) })),
    hidden: totalsJson(hidden),
    uncategorized: uncategorized && {
      activity: uncategorized.activity.toString(),
      cashActivity: uncategorized.cashActivity.toString(),
      creditActivity: uncategorized.creditActivity.toString(),
      available: uncategorized.available.toString(),
      cashOverspent: uncategorized.cashOverspent.toString(),
      creditOverspent: uncategorized.creditOverspent.toString(),
    },
  };
}

export const getBudgetMonthHandler: RouteHandler<typeof getBudgetMonth, Env> = async (c) => {
  const { budgetId, month } = c.req.valid("param");
  const { today = serverToday() } = c.req.valid("query");
  const { budget } = await loadBudgetAccess(c, budgetId);
  return c.json(await budgetMonthJson(c.var.deps.db, budget, month, today), 200);
};

export const assignCategoryHandler: RouteHandler<typeof assignCategory, Env> = async (c) => {
  const { budgetId, month, categoryId } = c.req.valid("param");
  const { assigned, today = serverToday() } = c.req.valid("json");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId, { budget: ["assign"] });

  const target = await moneyCategory(db, budgetId, categoryId);
  if (target.readyToAssign) throw new AppError(404, "NOT_FOUND", "Category not found");
  await assertMonthInRange(db, budgetId, month, today);

  await db.transaction(async (tx) => {
    const delta = BigInt(assigned) - (await assignedAmount(tx, categoryId, month));
    await adjustAssigned(tx, budget, categoryId, month, delta);
    if (delta === 0n) return;
    const readyToAssignId = await internalCategoryId(tx, budgetId, "ready_to_assign");
    await logMove(tx, budget, {
      userId: c.var.user.id,
      fromCategoryId: delta > 0n ? readyToAssignId : categoryId,
      toCategoryId: delta > 0n ? categoryId : readyToAssignId,
      month,
      amount: delta > 0n ? delta : -delta,
    });
  });
  return c.json(await budgetMonthJson(db, budget, month, today), 200);
};

export const moveMoneyHandler: RouteHandler<typeof moveMoney, Env> = async (c) => {
  const { budgetId, month } = c.req.valid("param");
  const { fromCategoryId, toCategoryId, amount, today = serverToday() } = c.req.valid("json");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId, { budget: ["assign"] });

  const from = await moneyCategory(db, budgetId, fromCategoryId);
  const to = await moneyCategory(db, budgetId, toCategoryId);
  if (from.id === to.id) {
    throw new AppError(400, "BAD_REQUEST", "Money has to move to another category");
  }
  const value = BigInt(amount);
  if (value <= 0n) throw new AppError(400, "BAD_REQUEST", "Move a positive amount");
  await assertMonthInRange(db, budgetId, month, today);

  // Moving money changes what each side has assigned; Ready to Assign follows from that.
  await db.transaction(async (tx) => {
    if (!from.readyToAssign) await adjustAssigned(tx, budget, from.id, month, -value);
    if (!to.readyToAssign) await adjustAssigned(tx, budget, to.id, month, value);
    await logMove(tx, budget, {
      userId: c.var.user.id,
      fromCategoryId: from.id,
      toCategoryId: to.id,
      month,
      amount: value,
    });
  });
  return c.json(await budgetMonthJson(db, budget, month, today), 200);
};

export const autoAssignHandler: RouteHandler<typeof autoAssign, Env> = async (c) => {
  const { budgetId, month } = c.req.valid("param");
  const { option, categoryIds, today = serverToday() } = c.req.valid("json");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId, { budget: ["assign"] });
  await assertMonthInRange(db, budgetId, month, today);

  // The listed categories asked for, or every one that isn't hidden.
  const rows = await db
    .select({ id: category.id, hidden: category.hidden, groupHidden: categoryGroup.hidden })
    .from(category)
    .innerJoin(categoryGroup, eq(categoryGroup.id, category.groupId))
    .where(
      and(
        eq(category.budgetId, budgetId),
        isNull(category.internalKind),
        categoryIds ? inArray(category.id, categoryIds) : undefined,
      ),
    );
  if (categoryIds && rows.length !== new Set(categoryIds).size) {
    throw new AppError(404, "NOT_FOUND", "Category not found");
  }
  const targets = categoryIds ? rows : rows.filter((r) => !r.hidden && !r.groupHidden);

  const { end } = monthBounds(month);
  const { history } = await budgetHistory(db, budgetId, end < today ? end : today);
  await db.transaction(async (tx) => {
    const readyToAssignId = await internalCategoryId(tx, budgetId, "ready_to_assign");
    for (const { id } of targets) {
      const entries = history.get(id) ?? [];
      const target = autoAssignAmounts(entries, month)[option];
      const delta = target - (await assignedAmount(tx, id, month));
      if (delta === 0n) continue;
      await adjustAssigned(tx, budget, id, month, delta);
      await logMove(tx, budget, {
        userId: c.var.user.id,
        fromCategoryId: delta > 0n ? readyToAssignId : id,
        toCategoryId: delta > 0n ? id : readyToAssignId,
        month,
        amount: delta > 0n ? delta : -delta,
      });
    }
  });
  return c.json(await budgetMonthJson(db, budget, month, today), 200);
};

export const listMovesHandler: RouteHandler<typeof listMoves, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId);
  const readyToAssignId = await internalCategoryId(db, budgetId, "ready_to_assign");
  const rows = await db
    .select({
      id: moneyMove.id,
      fromCategoryId: moneyMove.fromCategoryId,
      toCategoryId: moneyMove.toCategoryId,
      month: moneyMove.month,
      amount: moneyMove.amount,
      createdAt: moneyMove.createdAt,
      userName: user.name,
    })
    .from(moneyMove)
    .leftJoin(user, eq(user.id, moneyMove.userId))
    .where(eq(moneyMove.budgetId, budgetId))
    .orderBy(desc(moneyMove.createdAt), desc(moneyMove.id))
    .limit(RECENT_MOVES);
  return c.json(
    {
      moves: rows.map((m) => ({
        id: m.id,
        kind:
          m.fromCategoryId === readyToAssignId
            ? ("assigned" as const)
            : m.toCategoryId === readyToAssignId
              ? ("removed" as const)
              : ("moved" as const),
        fromCategoryId: m.fromCategoryId === readyToAssignId ? null : m.fromCategoryId,
        toCategoryId: m.toCategoryId === readyToAssignId ? null : m.toCategoryId,
        month: monthOf(m.month),
        amount: m.amount.toString(),
        movedAt: m.createdAt.toISOString(),
        userName: m.userName,
      })),
    },
    200,
  );
};

/** How many moves "Recent Moves" lists (YNAB's limit is open in docs/verify.md). */
const RECENT_MOVES = 100;
