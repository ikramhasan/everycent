import { newId, sql } from "@everycent/db";
import {
  category,
  categoryAssignment,
  categoryGroup,
  subTransaction,
  transaction,
} from "@everycent/db/schema";
import {
  type BudgetMonth,
  budgetMonthRange,
  type CategoryMonth,
  type CurrencyCode,
  categoryMonth,
  categoryOverspending,
  type MonthAmount,
  type MonthFigures,
  monthBounds,
  monthOf,
  readyToAssign,
} from "@everycent/engine";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, eq, isNotNull, lte, max, min } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { loadBudgetAccess } from "../../lib/budget-access";
import { AppError } from "../../lib/errors";
import { type Db, serverToday } from "../../lib/ledger";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type { assignCategory, getBudgetMonth } from "./routes";

type Env = AppEnv & AuthedEnv;

const monthKey = (date: AnyPgColumn) => sql<string>`to_char(${date}, 'YYYY-MM')`;
// Postgres returns numeric sums as strings; BigInt parses them exactly.
const total = (amount: AnyPgColumn) => sql<string>`sum(${amount})`;

/**
 * Each category's activity per month up to `cutoff`, and its assigned amounts in every month (money
 * assigned in later months counts toward Ready to Assign).
 */
async function categoryHistory(db: Db, budgetId: string, cutoff: string) {
  const rows = await db
    .select({
      categoryId: transaction.categoryId,
      month: monthKey(transaction.date),
      amount: total(transaction.amount),
    })
    .from(transaction)
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
    })
    .from(subTransaction)
    .innerJoin(transaction, eq(transaction.id, subTransaction.transactionId))
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
    push(r.categoryId, { month: r.month, assigned: 0n, activity: BigInt(r.amount) });
  }
  for (const r of assigned)
    push(r.categoryId, { month: r.month, assigned: r.amount, activity: 0n });
  return history;
}

const ZERO: CategoryMonth = { carried: 0n, assigned: 0n, activity: 0n, available: 0n };

function addTo(sum: CategoryMonth, n: CategoryMonth): CategoryMonth {
  return {
    carried: sum.carried + n.carried,
    assigned: sum.assigned + n.assigned,
    activity: sum.activity + n.activity,
    available: sum.available + n.available,
  };
}

const totalsJson = (n: CategoryMonth) => ({
  assigned: n.assigned.toString(),
  activity: n.activity.toString(),
  available: n.available.toString(),
});

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
  const history = await categoryHistory(db, budgetId, cutoff);

  const [earliest] = await db
    .select({ date: min(transaction.date) })
    .from(transaction)
    .where(eq(transaction.budgetId, budgetId));
  const [latest] = await db
    .select({ month: max(categoryAssignment.month) })
    .from(categoryAssignment)
    .where(eq(categoryAssignment.budgetId, budgetId));
  const range = budgetMonthRange({
    current: monthOf(today),
    earliestTransaction: earliest?.date ? monthOf(earliest.date) : null,
    latestAssigned: latest?.month ? monthOf(latest.month) : null,
  });

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

  const listed: { categoryId: string; figures: CategoryMonth }[] = [];
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
    // Every category's overspending comes out of the next month's Ready to Assign, hidden and
    // Uncategorized included (phase 7 will treat credit card spending differently).
    overspent.push(...categoryOverspending(entries));
    assigned.push(...entries.map((e) => ({ month: e.month, amount: e.assigned })));
    const figures = categoryMonth(entries, month);
    if (cat.internalKind === "uncategorized") {
      // YNAB lists it only in months with uncategorized transactions.
      if (entries.some((e) => e.month === month)) uncategorized = figures;
      continue;
    }
    listed.push({ categoryId: cat.id, figures });
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
    categories: listed.map((l) => ({ categoryId: l.categoryId, ...totalsJson(l.figures) })),
    groups: groupRows.map((g) => ({ groupId: g.id, ...totalsJson(groups.get(g.id) ?? ZERO) })),
    hidden: totalsJson(hidden),
    uncategorized: uncategorized && {
      activity: uncategorized.activity.toString(),
      available: uncategorized.available.toString(),
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

  const [target] = await db
    .select({ id: category.id, internalKind: category.internalKind })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.budgetId, budgetId)));
  if (!target || target.internalKind) throw new AppError(404, "NOT_FOUND", "Category not found");

  const { firstMonth, lastMonth } = await budgetMonthJson(db, budget, monthOf(today), today);
  if (month < firstMonth || month > lastMonth) {
    throw new AppError(
      400,
      "MONTH_OUT_OF_RANGE",
      `Money can be assigned from ${firstMonth} to ${lastMonth}`,
    );
  }

  // The row stays at zero too: YNAB keeps a month open once money was assigned in it.
  await db
    .insert(categoryAssignment)
    .values({
      id: newId(),
      budgetId,
      categoryId,
      month: `${month}-01`,
      amount: BigInt(assigned),
      currency: budget.currency,
    })
    .onConflictDoUpdate({
      target: [categoryAssignment.categoryId, categoryAssignment.month],
      set: { amount: BigInt(assigned), updatedAt: new Date() },
    });
  return c.json(await budgetMonthJson(db, budget, month, today), 200);
};
