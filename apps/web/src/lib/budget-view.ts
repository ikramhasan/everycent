import { targetPercent } from "@everycent/engine";
import { useCallback, useState } from "react";
import type { BudgetMonthData, MonthTotals } from "./months";
import type { TargetNeed } from "./targets";

/** YNAB's views above the budget list, in its order. */
export const BUDGET_FILTERS = [
  "all",
  "overspent",
  "underfunded",
  "overfunded",
  "available",
  "snoozed",
] as const;
export type BudgetFilter = (typeof BUDGET_FILTERS)[number];

/** The id the Uncategorized Transactions row is selected under. */
export const UNCATEGORIZED = "uncategorized";

/**
 * Whether a category's numbers belong in a view: Overspent is below zero, Money Available above;
 * Underfunded is anything Underfunded would add to (overspending included), Overfunded anything
 * Reduce Overfunding would take from (YNAB, docs/verify.md "Underfunded and Reduce Overfunding").
 * Uncategorized, with no Auto-Assign, counts as underfunded while it's negative. Snoozed is a
 * target snoozed this month.
 */
export function matchesFilter(
  filter: BudgetFilter,
  totals: {
    available: string;
    assigned?: string;
    autoAssign?: { underfunded: string; reduceOverfunding: string };
    target?: { snoozed: boolean } | null;
  },
) {
  if (filter === "all") return true;
  const available = BigInt(totals.available);
  const { assigned = "0", autoAssign } = totals;
  switch (filter) {
    case "overspent":
      return available < 0n;
    case "available":
      return available > 0n;
    case "underfunded":
      return autoAssign ? BigInt(autoAssign.underfunded) > BigInt(assigned) : available < 0n;
    case "overfunded":
      return autoAssign ? BigInt(autoAssign.reduceOverfunding) < BigInt(assigned) : false;
    case "snoozed":
      return Boolean(totals.target?.snoozed);
  }
}

/** What each view says when nothing is in it (YNAB's wording). */
export const EMPTY_VIEW: Record<Exclude<BudgetFilter, "all">, string> = {
  overspent: "That's a win! You've knocked out all overspent categories.",
  underfunded: "Cheers! You don't currently have any underfunded categories.",
  overfunded: "You don't currently have any overfunded targets.",
  available: "You don't currently have categories with money available.",
  snoozed: "You don't currently have categories with snoozed targets in this month.",
};

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
 * part keeps it red), or a payment category that doesn't cover what its card owes (or, with a
 * target, what the target asks). YNAB shows the
 * payment's Underfunded alert only from the current month on; earlier months stay green
 * (support.ynab.com, docs/verify.md phase 7c).
 */
/**
 * What a category's upcoming scheduled transactions need beyond Available (YNAB's negative
 * "Available After Upcoming"); zero when it covers them or nothing is coming.
 */
export function upcomingShortfall(totals: {
  available: string;
  upcoming?: { amount: string } | null;
}): bigint {
  if (!totals.upcoming) return 0n;
  const after = BigInt(totals.available) + BigInt(totals.upcoming.amount);
  return after < 0n && BigInt(totals.upcoming.amount) < 0n ? -after : 0n;
}

export function isCaution(
  totals: Pick<MonthTotals, "available" | "cashOverspent"> & {
    payment?: { underfunded: string } | null;
    target?: { underfunded: string; snoozed?: boolean } | null;
    upcoming?: { amount: string } | null;
  },
  month: string,
  current: string,
) {
  // Not enough for what's scheduled later in the month is yellow, snoozed or not
  // (support.ynab.com "Colors and Icons"; YNAB, 2026-10-12: U10 A–D, F, I).
  const scheduledShort = !totals.available.startsWith("-") && upcomingShortfall(totals) > 0n;
  if (totals.payment) {
    // Paying more than was set aside is red (docs/verify.md, phase 7d).
    if (totals.available.startsWith("-")) return false;
    if (scheduledShort) return true;
    // With a target, its own status decides, as for any target (YNAB, 2026-10-08: Card E1 on
    // track was green with a part-filled pie, underfunded yellow).
    if (totals.target) return totals.target.underfunded !== "0";
    return totals.payment.underfunded !== "0" && month >= current;
  }
  if (totals.available.startsWith("-")) return totals.cashOverspent === "0";
  if (scheduledShort) return true;
  // An underfunded target is yellow in any month it applies to (docs/verify.md, phase 8a), unless
  // it's snoozed: then green or grey (support.ynab.com "Snooze a Target").
  return Boolean(totals.target && totals.target.underfunded !== "0" && !totals.target.snoozed);
}

/**
 * The icon on a category's Available pill: a target's pie filled to the funded percentage while
 * underfunded, a check when met (YNAB, docs/verify.md "Monthly targets"), Zz when snoozed, and a
 * calendar when scheduled transactions later in the month aren't covered.
 */
export type TargetMark =
  | { kind: "met" }
  | { kind: "underfunded"; percent: number }
  | { kind: "snoozed" }
  | { kind: "upcoming" };

/**
 * The icon a category's Available pill shows: the calendar when its upcoming scheduled
 * transactions aren't covered, over its target's pie or check (YNAB, 2026-10-12: U10 D's unmet
 * target and U10 I's met one showed the calendar); a snoozed target keeps its Zz
 * (support.ynab.com "Colors and Icons"). Payment categories keep their target's mark.
 */
export function availableMark(totals: {
  available: string;
  target?: TargetNeed | null;
  payment?: unknown;
  upcoming?: { amount: string } | null;
}): TargetMark | undefined {
  if (!totals.payment && !totals.target?.snoozed && upcomingShortfall(totals) > 0n) {
    return { kind: "upcoming" };
  }
  return targetMark(totals.target);
}

/** The mark a category's target puts on its Available pill, if it has one this month. */
export function targetMark(target: TargetNeed | null | undefined): TargetMark | undefined {
  if (!target) return undefined;
  if (target.snoozed) return { kind: "snoozed" };
  const needed = BigInt(target.needed);
  const funded = BigInt(target.funded);
  // Met shows a check; underfunded and "on track" show a pie filled to the share of the total.
  return funded >= needed
    ? { kind: "met" }
    : { kind: "underfunded", percent: targetPercent({ needed, funded }) };
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
/** A {@link Breakdown} back in the API's shape, for a row's totals. */
export function toTotals(b: Breakdown): MonthTotals {
  return {
    assigned: b.assigned.toString(),
    activity: b.activity.toString(),
    cashActivity: b.cashActivity.toString(),
    creditActivity: b.creditActivity.toString(),
    available: b.available.toString(),
    cashOverspent: b.cashOverspent.toString(),
    creditOverspent: b.creditOverspent.toString(),
  };
}

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
 * The budget list's view. YNAB keeps it across reloads and months, in the browser, per plan
 * (`{plan}_active_budget_view` in localStorage, checked 2026-10-11).
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

const PROGRESS_BARS_KEY = "everycent:progress-bars";

/**
 * YNAB's Progress Bars On/Off, kept in this browser (support.ynab.com: they "reset when cookies or
 * local storage are cleared"). On unless turned off.
 */
export function useProgressBars() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(PROGRESS_BARS_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const update = useCallback((next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(PROGRESS_BARS_KEY, next ? "on" : "off");
    } catch {
      // Storage can be unavailable (private windows); the setting still works for this visit.
    }
  }, []);
  return { progressBars: on, setProgressBars: update };
}
