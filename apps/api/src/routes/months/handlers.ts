import { sql } from "@everycent/db";
import {
  category,
  categoryAssignment,
  categoryGroup,
  subTransaction,
  transaction,
} from "@everycent/db/schema";
import {
  budgetMonthRange,
  type CategoryMonth,
  categoryMonth,
  type MonthFigures,
  monthBounds,
  monthOf,
} from "@everycent/engine";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, eq, isNotNull, lte, max, min } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { loadBudgetAccess } from "../../lib/budget-access";
import { type Db, serverToday } from "../../lib/ledger";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type { getBudgetMonth } from "./routes";

type Env = AppEnv & AuthedEnv;

const monthKey = (date: AnyPgColumn) => sql<string>`to_char(${date}, 'YYYY-MM')`;
// Postgres returns numeric sums as strings; BigInt parses them exactly.
const total = (amount: AnyPgColumn) => sql<string>`sum(${amount})`;

/** Each category's assigned amounts and activity per month, up to `month`. */
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
    .where(and(eq(categoryAssignment.budgetId, budgetId), lte(categoryAssignment.month, cutoff)));

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

export const getBudgetMonthHandler: RouteHandler<typeof getBudgetMonth, Env> = async (c) => {
  const { budgetId, month } = c.req.valid("param");
  const { today = serverToday() } = c.req.valid("query");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId);

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
  for (const cat of categories) {
    const entries = history.get(cat.id) ?? [];
    const figures = categoryMonth(entries, month);
    if (cat.internalKind === "uncategorized") {
      // YNAB lists it only in months with uncategorized transactions.
      if (entries.some((e) => e.month === month)) uncategorized = figures;
      continue;
    }
    if (cat.internalKind) continue;
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

  return c.json(
    {
      month,
      currency: budget.currency,
      firstMonth: range.first,
      lastMonth: range.last,
      categories: listed.map((l) => ({ categoryId: l.categoryId, ...totalsJson(l.figures) })),
      groups: groupRows.map((g) => ({ groupId: g.id, ...totalsJson(groups.get(g.id) ?? ZERO) })),
      hidden: totalsJson(hidden),
      uncategorized: uncategorized && {
        activity: uncategorized.activity.toString(),
        available: uncategorized.available.toString(),
      },
    },
    200,
  );
};
