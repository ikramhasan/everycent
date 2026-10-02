import { z } from "zod";

/** A budget month, "YYYY-MM". */
export type BudgetMonth = string;

/** Matches a budget month, "YYYY-MM". */
export const BUDGET_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const zBudgetMonth = z
  .string()
  .regex(BUDGET_MONTH_PATTERN, "Expected a month as YYYY-MM")
  .describe("YYYY-MM");

export function isBudgetMonth(value: string): value is BudgetMonth {
  return BUDGET_MONTH_PATTERN.test(value);
}

/** The month a YYYY-MM-DD date falls in. */
export function monthOf(isoDate: string): BudgetMonth {
  return isoDate.slice(0, 7);
}

/** `month` moved by `count` months (negative goes back). */
export function addMonths(month: BudgetMonth, count: number): BudgetMonth {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (m - 1) + count;
  const y = Math.floor(index / 12);
  return `${String(y).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** First and last calendar day of a month, YYYY-MM-DD. */
export function monthBounds(month: BudgetMonth): { start: string; end: string } {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** The months a budget can show (YNAB, checked in its web app on 2026-10-02). */
export function budgetMonthRange(input: {
  /** The user's current month. */
  current: BudgetMonth;
  /** Month of the budget's oldest transaction, if any. */
  earliestTransaction: BudgetMonth | null;
  /** Latest month money was ever assigned in (a $0 assignment counts), if any. */
  latestAssigned: BudgetMonth | null;
}): { first: BudgetMonth; last: BudgetMonth } {
  const { current, earliestTransaction, latestAssigned } = input;
  // One month before the oldest transaction.
  const oldest =
    earliestTransaction && earliestTransaction < current ? earliestTransaction : current;
  // One month past the current month, or past the latest month with money assigned.
  const newest = latestAssigned && latestAssigned > current ? latestAssigned : current;
  return { first: addMonths(oldest, -1), last: addMonths(newest, 1) };
}

export interface MonthFigures {
  month: BudgetMonth;
  assigned: bigint;
  activity: bigint;
}

export interface CategoryMonth {
  /** Available carried in from the month before (never negative). */
  carried: bigint;
  assigned: bigint;
  activity: bigint;
  available: bigint;
}

/**
 * A category's numbers for `month`, from its assigned amounts and activity in every month. What's
 * available rolls into the next month; a negative balance (overspending) doesn't, the category
 * starts the next month at zero.
 */
export function categoryMonth(history: readonly MonthFigures[], month: BudgetMonth): CategoryMonth {
  const sorted = [...history].filter((h) => h.month <= month).sort(byMonth);
  let carried = 0n;
  let available = 0n;
  let assigned = 0n;
  let activity = 0n;
  let previous: BudgetMonth | null = null;
  for (const entry of sorted) {
    if (entry.month !== previous) {
      if (previous !== null) carried = available > 0n ? available : 0n;
      available = carried;
      assigned = 0n;
      activity = 0n;
      previous = entry.month;
    }
    assigned += entry.assigned;
    activity += entry.activity;
    available += entry.assigned + entry.activity;
  }
  if (previous !== month) {
    // Nothing happened in `month` itself: it starts from what the last active month left.
    carried = previous === null || available < 0n ? 0n : available;
    return { carried, assigned: 0n, activity: 0n, available: carried };
  }
  return { carried, assigned, activity, available };
}

function byMonth(a: MonthFigures, b: MonthFigures) {
  return a.month < b.month ? -1 : a.month > b.month ? 1 : 0;
}

export interface MonthAmount {
  month: BudgetMonth;
  amount: bigint;
}

/**
 * What a category overspent in each month: its negative Available at the end of the month (YNAB's
 * cash overspending). Only months with activity or assignments can end negative, because what a
 * category carries in is never negative.
 */
export function categoryOverspending(history: readonly MonthFigures[]): MonthAmount[] {
  const months = [...new Set(history.map((h) => h.month))].sort();
  return months.flatMap((month) => {
    const { available } = categoryMonth(history, month);
    return available < 0n ? [{ month, amount: available }] : [];
  });
}

const total = (amounts: readonly MonthAmount[], keep: (month: BudgetMonth) => boolean) =>
  amounts.reduce((sum, a) => (keep(a.month) ? sum + a.amount : sum), 0n);

export interface ReadyToAssign {
  /** Ready to Assign shown in `month`; negative when more was assigned than there is. */
  readyToAssign: bigint;
  /** Money assigned in the months after `month`. */
  assignedInFuture: bigint;
}

/**
 * Ready to Assign for `month`, as YNAB computes it (checked in its web app on 2026-10-02):
 * income categorized to Ready to Assign up to the month, less every month's assigned money up to
 * it, less cash overspending of the months before it. Money assigned in later months takes from
 * what's left, but never pushes the month below zero.
 */
export function readyToAssign(input: {
  month: BudgetMonth;
  /** Inflows to Ready to Assign, by month. */
  income: readonly MonthAmount[];
  /** Assigned money of all categories, by month, later months included. */
  assigned: readonly MonthAmount[];
  /** Overspending (negative amounts) of all categories, by month. */
  overspent: readonly MonthAmount[];
}): ReadyToAssign {
  const { month } = input;
  const base =
    total(input.income, (m) => m <= month) -
    total(input.assigned, (m) => m <= month) +
    total(input.overspent, (m) => m < month);
  const assignedInFuture = total(input.assigned, (m) => m > month);
  const room = base > 0n ? base : 0n;
  const taken = assignedInFuture < room ? assignedInFuture : room;
  return { readyToAssign: base - taken, assignedInFuture };
}
