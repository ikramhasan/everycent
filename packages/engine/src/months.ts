import { z } from "zod";
import { divideRounded } from "./rounding";

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
  /** The part of `activity` on credit accounts (the rest was paid with cash). Defaults to zero. */
  creditActivity?: bigint;
  /**
   * Payment categories: the part of `activity` that is money moved in for funded card spending
   * (negative for returns). Defaults to zero.
   */
  fundedSpending?: bigint;
  /** Payment categories: the part of `activity` that is card payments (negative). Defaults to zero. */
  payments?: bigint;
}

export interface CategoryMonth {
  /** Available carried in from the month before (never negative). */
  carried: bigint;
  assigned: bigint;
  activity: bigint;
  /** The month's activity in cash accounts (YNAB's Cash Spending). */
  cashActivity: bigint;
  /** The month's activity in credit accounts (YNAB's Credit Spending). */
  creditActivity: bigint;
  /** Payment categories: money moved in this month for funded card spending (YNAB's Funded Spending). */
  fundedSpending: bigint;
  /** Payment categories: this month's card payments, negative (YNAB's Payments Made). */
  payments: bigint;
  available: bigint;
  /**
   * The part of a negative Available that's cash overspending (it comes out of next month's Ready
   * to Assign); zero when Available isn't negative.
   */
  cashOverspent: bigint;
  /** The rest of a negative Available: credit overspending, new card debt. */
  creditOverspent: bigint;
}

/**
 * How a month's overspending divides between cash and credit (YNAB, checked in its web app on
 * 2026-10-03): cash spending is funded first, so the cash shortfall is cash overspending (as much
 * of the negative Available as the cash spending accounts for) and the rest is credit. R2: Wallet
 * −$3 and Citi −$2 with $0 → $3 cash, $2 credit; with $2 → $1 cash, $2 credit; with $4 → $1 credit.
 */
export function splitOverspending(
  available: bigint,
  cashBeforeCards: bigint,
): { cashOverspent: bigint; creditOverspent: bigint } {
  if (available >= 0n) return { cashOverspent: 0n, creditOverspent: 0n };
  const cash =
    cashBeforeCards < 0n ? (cashBeforeCards < available ? available : cashBeforeCards) : 0n;
  return { cashOverspent: cash, creditOverspent: available - cash };
}

/**
 * A category's numbers for `month`, from its assigned amounts and activity in every month. What's
 * available rolls into the next month; a negative balance (overspending) doesn't, the category
 * starts the next month at zero.
 *
 * Activity is also split by how it was paid, as YNAB's inspector shows it (checked in its web app
 * on 2026-10-03): Cash Spending is the net of the month's activity in cash accounts and Credit
 * Spending the net in credit accounts, refunds included (−$4 and +$10 in cash showed as $6.00).
 * The split changes nothing else here; how credit spending moves money is phase 7b.
 */
export function categoryMonth(history: readonly MonthFigures[], month: BudgetMonth): CategoryMonth {
  const sorted = [...history].filter((h) => h.month <= month).sort(byMonth);
  let carried = 0n;
  let available = 0n;
  let assigned = 0n;
  let activity = 0n;
  let creditActivity = 0n;
  let fundedSpending = 0n;
  let payments = 0n;
  let previous: BudgetMonth | null = null;
  for (const entry of sorted) {
    if (entry.month !== previous) {
      if (previous !== null) carried = available > 0n ? available : 0n;
      available = carried;
      assigned = 0n;
      activity = 0n;
      creditActivity = 0n;
      fundedSpending = 0n;
      payments = 0n;
      previous = entry.month;
    }
    assigned += entry.assigned;
    activity += entry.activity;
    creditActivity += entry.creditActivity ?? 0n;
    fundedSpending += entry.fundedSpending ?? 0n;
    payments += entry.payments ?? 0n;
    available += entry.assigned + entry.activity;
  }
  if (previous !== month) {
    // Nothing happened in `month` itself: it starts from what the last active month left.
    carried = previous === null || available < 0n ? 0n : available;
    return {
      carried,
      assigned: 0n,
      activity: 0n,
      cashActivity: 0n,
      creditActivity: 0n,
      fundedSpending: 0n,
      payments: 0n,
      available: carried,
      cashOverspent: 0n,
      creditOverspent: 0n,
    };
  }
  const cashActivity = activity - creditActivity - fundedSpending - payments;
  return {
    carried,
    assigned,
    activity,
    cashActivity,
    creditActivity,
    fundedSpending,
    payments,
    available,
    // What it had before card spending: carried in, assigned and cash activity. A payment category
    // paid below zero is cash overspending (YNAB: red, deducted from next month), and so is one a
    // card return took below zero: returns moving money out aren't card spending (YNAB, 2026-10-14,
    // x128 Card A: a $5 uncategorized return left the payment category at −$4, deducted from
    // November).
    ...splitOverspending(
      available,
      available - creditActivity - (fundedSpending > 0n ? fundedSpending : 0n),
    ),
  };
}

function byMonth(a: MonthFigures, b: MonthFigures) {
  return a.month < b.month ? -1 : a.month > b.month ? 1 : 0;
}

export interface MonthAmount {
  month: BudgetMonth;
  amount: bigint;
}

/**
 * What a category overspent in cash in each month: the cash part of its negative Available at the
 * end of the month (YNAB's cash overspending, which comes out of the next month's Ready to Assign).
 * Credit overspending is new card debt and isn't listed. Only months with activity or assignments
 * can end negative, because what a category carries in is never negative.
 */
export function categoryOverspending(history: readonly MonthFigures[]): MonthAmount[] {
  const months = [...new Set(history.map((h) => h.month))].sort();
  return months.flatMap((month) => {
    const { cashOverspent } = categoryMonth(history, month);
    return cashOverspent < 0n ? [{ month, amount: cashOverspent }] : [];
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

/**
 * Whether a negative Ready to Assign is an overdraft (YNAB's "Overdraft? We can help with that!")
 * rather than money assigned beyond what there is ("You assigned more than you have" with Fix
 * This): even taking back every category's cash wouldn't bring it to zero. A category's cash is its
 * Available with credit overspending left out (cash overspending counts against it; overspent
 * amounts are negative, so it's `available - creditOverspent`); every category counts, payment
 * and hidden ones included, but not Uncategorized. Checked in YNAB on 2026-10-11 (YNAB findings):
 * the month on screen doesn't matter, and exactly zero isn't one.
 */
export function isOverdraft(
  readyToAssign: bigint,
  categories: readonly Pick<CategoryMonth, "available" | "creditOverspent">[],
): boolean {
  if (readyToAssign >= 0n) return false;
  let cash = readyToAssign;
  for (const c of categories) cash += c.available - c.creditOverspent;
  return cash < 0n;
}

/** YNAB's Auto-Assign options, in its order. */
export const AUTO_ASSIGN_OPTIONS = [
  "underfunded",
  "assignedLastMonth",
  "spentLastMonth",
  "averageAssigned",
  "averageSpent",
  "reduceOverfunding",
  "resetAvailable",
  "resetAssigned",
] as const;
export type AutoAssignOption = (typeof AUTO_ASSIGN_OPTIONS)[number];
/** The options worked out from a category's history alone (the others need its target). */
export type HistoryAutoAssignOption = Exclude<
  AutoAssignOption,
  "underfunded" | "reduceOverfunding"
>;

/** How many months YNAB's averages look back (its help center: "up to the last 12 months"). */
const AVERAGE_MONTHS = 12;

/**
 * What each Auto-Assign option would set a category's Assigned to in `month`, from its history
 * (support.ynab.com "Auto-Assign", checked in YNAB's web app on 2026-10-03):
 * - Assigned Last Month: last month's Assigned.
 * - Spent Last Month: last month's spending (outflows less refunds, never below zero).
 * - Average Assigned / Average Spent: the average over up to the last 12 months before `month`,
 *   from the first of them in which the category had money assigned or spent (YNAB showed $15 for
 *   $30 assigned in September and spending in August).
 * - Reset Available: Assigned changes so Available ends at zero, both ways: money goes back to
 *   Ready to Assign, and an overspent category is covered from it (YNAB: Utilities, $25.00
 *   overspent, went to $25.00 assigned).
 * - Reset Assigned: zero.
 * Averages are rounded to the minor unit, halves away from zero (YNAB, checked 2026-10-11:
 * $0.05 over two months is $0.03, −$0.05 is −$0.03, $0.07 over three is $0.02).
 */
export function autoAssignAmounts(
  history: readonly MonthFigures[],
  month: BudgetMonth,
): Record<HistoryAutoAssignOption, bigint> {
  const last = addMonths(month, -1);
  const byMonth = new Map<BudgetMonth, { assigned: bigint; activity: bigint }>();
  for (const h of history) {
    const m = byMonth.get(h.month) ?? { assigned: 0n, activity: 0n };
    byMonth.set(h.month, { assigned: m.assigned + h.assigned, activity: m.activity + h.activity });
  }
  const spent = (activity: bigint) => (activity < 0n ? -activity : 0n);

  const windowStart = addMonths(month, -AVERAGE_MONTHS);
  const active = [...byMonth]
    .filter(([m, v]) => m >= windowStart && m < month && (v.assigned !== 0n || v.activity !== 0n))
    .map(([m]) => m)
    .sort();
  let averageAssigned = 0n;
  let averageSpent = 0n;
  const first = active[0];
  if (first) {
    let count = 0n;
    let assigned = 0n;
    let activity = 0n;
    for (let m = first; m < month; m = addMonths(m, 1)) {
      count += 1n;
      assigned += byMonth.get(m)?.assigned ?? 0n;
      activity += byMonth.get(m)?.activity ?? 0n;
    }
    averageAssigned = divideRounded(assigned, count, "half-up");
    averageSpent = divideRounded(spent(activity), count, "half-up");
  }

  const current = categoryMonth(history, month);
  return {
    assignedLastMonth: byMonth.get(last)?.assigned ?? 0n,
    spentLastMonth: spent(byMonth.get(last)?.activity ?? 0n),
    averageAssigned,
    averageSpent,
    resetAvailable: current.assigned - current.available,
    resetAssigned: 0n,
  };
}
