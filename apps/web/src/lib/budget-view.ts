import { useCallback, useState } from "react";
import type { BudgetMonthData, MonthTotals } from "./months";

/**
 * YNAB's views above the budget list. Underfunded, Overfunded and Snoozed need targets (phase 8).
 */
export const BUDGET_FILTERS = ["all", "overspent", "available"] as const;
export type BudgetFilter = (typeof BUDGET_FILTERS)[number];

/** The id the Uncategorized Transactions row is selected under. */
export const UNCATEGORIZED = "uncategorized";

/** Whether a category's numbers belong in a view: Overspent is below zero, Money Available above. */
export function matchesFilter(filter: BudgetFilter, totals: { available: string }) {
  if (filter === "all") return true;
  const available = BigInt(totals.available);
  return filter === "overspent" ? available < 0n : available > 0n;
}

/**
 * The categories a view shows, visible ones only (YNAB leaves hidden categories out of every view
 * but All), plus Uncategorized when it matches.
 */
export function filteredIds(
  filter: BudgetFilter,
  month: BudgetMonthData,
  visible: ReadonlySet<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const c of month.categories) {
    if (visible.has(c.categoryId) && matchesFilter(filter, c)) ids.add(c.categoryId);
  }
  if (month.uncategorized && matchesFilter(filter, month.uncategorized)) ids.add(UNCATEGORIZED);
  return ids;
}

/** How many categories are overspent this month (YNAB's "3 Overspent"). */
export function overspentCount(month: BudgetMonthData, visible: ReadonlySet<string>) {
  return filteredIds("overspent", month, visible).size;
}

export interface Breakdown {
  /** Left over from last month (what the categories carried in). */
  carried: bigint;
  assigned: bigint;
  activity: bigint;
  available: bigint;
}

/** What a category carried in from last month: Available less this month's assigned and activity. */
export function breakdown(totals: MonthTotals): Breakdown {
  const assigned = BigInt(totals.assigned);
  const activity = BigInt(totals.activity);
  const available = BigInt(totals.available);
  return { carried: available - assigned - activity, assigned, activity, available };
}

/**
 * The inspector's month summary over the given categories (`UNCATEGORIZED` included), as YNAB adds
 * up the rows in view: every category, hidden ones too, under All.
 */
export function summarize(month: BudgetMonthData, ids: Iterable<string>): Breakdown {
  const byId = new Map(month.categories.map((c) => [c.categoryId, c]));
  const sum: Breakdown = { carried: 0n, assigned: 0n, activity: 0n, available: 0n };
  for (const id of ids) {
    const totals =
      id === UNCATEGORIZED
        ? month.uncategorized && { assigned: "0", ...month.uncategorized }
        : byId.get(id);
    if (!totals) continue;
    const b = breakdown(totals);
    sum.carried += b.carried;
    sum.assigned += b.assigned;
    sum.activity += b.activity;
    sum.available += b.available;
  }
  return sum;
}

function readFilter(key: string): BudgetFilter {
  try {
    const value = localStorage.getItem(key);
    return BUDGET_FILTERS.find((f) => f === value) ?? "all";
  } catch {
    return "all";
  }
}

/**
 * The budget list's view. YNAB keeps it across reloads and months; where (account or browser) is
 * open in docs/verify.md, so this browser it is, per budget.
 */
export function useBudgetFilter(budgetId: string) {
  const key = `everycent:budget-filter:${budgetId}`;
  const [filter, setFilter] = useState<BudgetFilter>(() => readFilter(key));
  const update = useCallback(
    (next: BudgetFilter) => {
      setFilter(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Storage can be unavailable (private windows); the view still works for this visit.
      }
    },
    [key],
  );
  return { filter, setFilter: update };
}
