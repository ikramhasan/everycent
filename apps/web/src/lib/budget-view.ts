import { targetPercent } from "@everycent/engine";
import { useCallback, useState } from "react";
import type { BudgetMonthData, MonthTotals } from "./months";
import type { TargetNeed } from "./targets";

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

/**
 * Whether YNAB draws a category's Available yellow: overspent with credit only (any uncovered cash
 * part keeps it red), or a payment category that doesn't cover what its card owes. YNAB shows the
 * payment's Underfunded alert only from the current month on; earlier months stay green
 * (support.ynab.com, docs/verify.md phase 7c).
 */
export function isCaution(
  totals: Pick<MonthTotals, "available" | "cashOverspent"> & {
    payment?: { underfunded: string } | null;
    target?: { underfunded: string } | null;
  },
  month: string,
  current: string,
) {
  if (totals.payment) return totals.payment.underfunded !== "0" && month >= current;
  if (totals.available.startsWith("-")) return totals.cashOverspent === "0";
  // An underfunded target is yellow in any month it applies to (docs/verify.md, phase 8a).
  return Boolean(totals.target && totals.target.underfunded !== "0");
}

/**
 * What a category's target shows on its Available pill: a pie filled to the funded percentage while
 * underfunded, a check when met (YNAB, docs/verify.md "Monthly targets").
 */
export type TargetMark = { met: true } | { met: false; percent: number };

/** The mark a category's target puts on its Available pill, if it has one this month. */
export function targetMark(target: TargetNeed | null | undefined): TargetMark | undefined {
  if (!target) return undefined;
  const needed = BigInt(target.needed);
  const funded = BigInt(target.funded);
  // Met shows a check; underfunded and "on track" show a pie filled to the share of the total.
  return funded >= needed
    ? { met: true }
    : { met: false, percent: targetPercent({ needed, funded }) };
}

export interface Breakdown {
  /** Left over from last month (what the categories carried in). */
  carried: bigint;
  assigned: bigint;
  activity: bigint;
  /** The part of activity in cash accounts (YNAB's Cash Spending). */
  cashActivity: bigint;
  /** The part of activity in credit accounts (YNAB's Credit Spending). */
  creditActivity: bigint;
  available: bigint;
  /** The cash part of a negative Available (taken from next month's Ready to Assign). */
  cashOverspent: bigint;
  /** The credit part of a negative Available (new card debt). */
  creditOverspent: bigint;
}

/** What a category carried in from last month: Available less this month's assigned and activity. */
export function breakdown(totals: MonthTotals): Breakdown {
  const assigned = BigInt(totals.assigned);
  const activity = BigInt(totals.activity);
  const available = BigInt(totals.available);
  return {
    carried: available - assigned - activity,
    assigned,
    activity,
    cashActivity: BigInt(totals.cashActivity),
    creditActivity: BigInt(totals.creditActivity),
    available,
    cashOverspent: BigInt(totals.cashOverspent),
    creditOverspent: BigInt(totals.creditOverspent),
  };
}

/**
 * The inspector's month summary over the given categories (`UNCATEGORIZED` included), as YNAB adds
 * up the rows in view: every category, hidden ones too, under All.
 */
export function summarize(month: BudgetMonthData, ids: Iterable<string>): Breakdown {
  const byId = new Map(month.categories.map((c) => [c.categoryId, c]));
  const sum: Breakdown = {
    carried: 0n,
    assigned: 0n,
    activity: 0n,
    cashActivity: 0n,
    creditActivity: 0n,
    available: 0n,
    cashOverspent: 0n,
    creditOverspent: 0n,
  };
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
    sum.cashActivity += b.cashActivity;
    sum.creditActivity += b.creditActivity;
    sum.cashOverspent += b.cashOverspent;
    sum.creditOverspent += b.creditOverspent;
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
