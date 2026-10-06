import { z } from "zod";
import {
  addMonths,
  type BudgetMonth,
  type CategoryMonth,
  categoryMonth,
  type MonthFigures,
  monthOf,
} from "./months";

/**
 * What a target asks for (YNAB's "Next month I want to" / "I want to"):
 * - set_aside: "Set aside another…": the full amount each period; money carried in doesn't count.
 * - refill: "Refill up to…" (custom: "Fill up to…"): only what brings the category up to the amount.
 * - balance: "Have a balance of…" (custom only): reach the amount, by a month or eventually.
 */
export const TARGET_BEHAVIORS = ["set_aside", "refill", "balance"] as const;
export type TargetBehavior = (typeof TARGET_BEHAVIORS)[number];
export const zTargetBehavior = z.enum(TARGET_BEHAVIORS);

/** YNAB's four target tabs. */
export const TARGET_CADENCES = ["weekly", "monthly", "yearly", "custom"] as const;
export type TargetCadence = (typeof TARGET_CADENCES)[number];
export const zTargetCadence = z.enum(TARGET_CADENCES);

/** How a custom target repeats: every N months (1–11) or years (1–2). */
export const TARGET_REPEAT_UNITS = ["month", "year"] as const;
export type TargetRepeatUnit = (typeof TARGET_REPEAT_UNITS)[number];

export interface CategoryTarget {
  cadence: TargetCadence;
  behavior: TargetBehavior;
  /** Minor units: per week (weekly), per month (monthly), or per period (yearly, custom). */
  amount: bigint;
  /**
   * Monthly: day of the month it's due (1–31), null for the last day. Weekly: the weekday
   * (0 = Sunday … 6 = Saturday). Null otherwise. Only changes the wording.
   */
  dueDay: number | null;
  /**
   * Yearly and custom: the (first) due date, YYYY-MM-DD; a balance target's is the first of its
   * month, or null for "eventually". Null for weekly and monthly.
   */
  dueDate: string | null;
  /** Custom: repeats every `repeatEvery` `repeatUnit`s; null for a one-time target. */
  repeatEvery: number | null;
  repeatUnit: TargetRepeatUnit | null;
  /** The first month the target applies to (YNAB's goal creation month). */
  startMonth: BudgetMonth;
}

export interface TargetNeed {
  /**
   * What the target needs: this month's amount (weekly, monthly), the period's total (yearly,
   * custom), or the balance to reach. YNAB's "Amount to Assign This Month", "Total to Assign by…",
   * "Needed…", "Balance Needed…".
   */
  needed: bigint;
  /** What counts toward `needed` (YNAB's "Assigned So Far", "Funded", "Current Balance"). */
  funded: bigint;
  /** What's still to assign this month to stay on track; never below zero. */
  underfunded: bigint;
  /**
   * What the target asks of this month before anything is assigned in it: the month's amount
   * (weekly, monthly) or this month's share of what's missing (yearly, custom); zero for a balance
   * with no date. YNAB adds these up as the month's targets ("October's Targets").
   */
  monthAmount: bigint;
  /**
   * What Reduce Overfunding takes back: this month's Assigned above what the month asks, never more
   * than the category's Available; zero for a balance with no date.
   */
  overfunded: bigint;
  /** The due date of the period `month` is in (yearly, custom), YYYY-MM-DD; null otherwise. */
  dueDate: string | null;
}

/** Months from `a` to `b`, counting both ends (a ≤ b). */
const monthsThrough = (a: BudgetMonth, b: BudgetMonth) => {
  const [ay, am] = a.split("-").map(Number) as [number, number];
  const [by, bm] = b.split("-").map(Number) as [number, number];
  return (by - ay) * 12 + (bm - am) + 1;
};

const ceilDiv = (a: bigint, b: bigint) => (a <= 0n ? 0n : (a + b - 1n) / b);

/** How many times `weekday` (0 = Sunday) falls in `month`. */
export function weekdaysIn(month: BudgetMonth, weekday: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  // Days 1..days whose weekday matches: the first is day 1 + offset, then every 7 days.
  const offset = (weekday - first + 7) % 7;
  return offset >= days ? 0 : Math.floor((days - 1 - offset) / 7) + 1;
}

/** Months between due dates: yearly is 12, custom every N months or N × 12. */
function periodMonths(target: CategoryTarget): number | null {
  if (target.cadence === "yearly") return 12;
  if (target.cadence !== "custom" || !target.repeatEvery || !target.repeatUnit) return null;
  return target.repeatUnit === "year" ? target.repeatEvery * 12 : target.repeatEvery;
}

/**
 * The period of a dated target that `month` falls in: its due date and first month. A repeating
 * target starts a new period the month after each due month; a one-time target has none after its
 * due month (null).
 */
function periodOf(target: CategoryTarget, dueDate: string, month: BudgetMonth) {
  const firstDue = monthOf(dueDate);
  const step = periodMonths(target);
  if (step === null) {
    return month <= firstDue ? { due: dueDate, dueMonth: firstDue, start: null } : null;
  }
  // Due months fall every `step` months from the first; take the first one at or after `month`.
  let k = 0;
  if (month > firstDue) k = Math.ceil((monthsThrough(firstDue, month) - 1) / step);
  const dueMonth = addMonths(firstDue, k * step);
  const due = `${dueMonth}-${dueDate.slice(8)}`;
  return { due: clampDay(due), dueMonth, start: addMonths(dueMonth, 1 - step) };
}

/** A YYYY-MM-DD whose day is past its month's end moves to the last day (Jan 31 → Feb 28). */
function clampDay(date: string) {
  const month = monthOf(date);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Number(date.slice(8));
  return day > last ? `${month}-${String(last).padStart(2, "0")}` : date;
}

/**
 * What a category's target asks for in `month`, from the category's history (YNAB, checked through
 * its API and web app on 2026-10-03, docs/verify.md "Monthly targets" and "Weekly, yearly and
 * custom targets"). Nothing before the target's start month (null).
 *
 * - Monthly and weekly: the month's amount (weekly: once per occurrence of its weekday). Set aside
 *   counts this month's Assigned; refill counts what was carried in plus this month's Assigned.
 * - Yearly and custom (dated): the period's total, spread over the months left up to the due month,
 *   rounding up. Set aside counts what was assigned in the period; refill and balance count what was
 *   carried in plus this month's Assigned. This month's share is what's missing from the total
 *   before this month, divided by the months left; anything assigned this month counts against it.
 * - Balance without a date: never asks for money this month.
 *
 * In a month after `currentMonth` (the user's month) carried money doesn't count for refill and
 * balance: leftover money only counts once the month begins.
 */
export function targetNeed(
  history: readonly MonthFigures[],
  target: CategoryTarget,
  month: BudgetMonth,
  currentMonth: BudgetMonth,
): TargetNeed | null {
  if (month < target.startMonth) return null;
  const figures = categoryMonth(history, month);
  const carried = month <= currentMonth ? figures.carried : 0n;
  const holds = target.behavior !== "set_aside";

  if (target.cadence === "monthly" || target.cadence === "weekly") {
    const needed =
      target.cadence === "weekly"
        ? target.amount * BigInt(weekdaysIn(month, target.dueDay ?? 0))
        : target.amount;
    // What this month's Assigned has to reach: refill counts what was carried in (below zero
    // when more was carried in than the target).
    const due = holds ? needed - carried : needed;
    return {
      needed,
      funded: holds ? carried + figures.assigned : figures.assigned,
      underfunded: under(due, figures.assigned),
      monthAmount: needed,
      overfunded: over(figures, due),
      dueDate: null,
    };
  }

  const needed = target.amount;
  if (!target.dueDate) {
    // "Have a balance of…" eventually: tracked, never asked for this month.
    return {
      needed,
      funded: carried + figures.assigned,
      underfunded: 0n,
      monthAmount: 0n,
      overfunded: 0n,
      dueDate: null,
    };
  }
  const period = periodOf(target, target.dueDate, month);
  if (!period) return null;
  const monthsLeft = BigInt(monthsThrough(month, period.dueMonth));

  if (holds) {
    const share = shareOf(needed - carried, monthsLeft);
    return {
      needed,
      funded: carried + figures.assigned,
      underfunded: under(share, figures.assigned),
      monthAmount: share > 0n ? share : 0n,
      overfunded: over(figures, share),
      dueDate: period.due,
    };
  }
  // Set aside: what was assigned in the period, no earlier than the target's start.
  const from =
    period.start === null || period.start < target.startMonth ? target.startMonth : period.start;
  let before = 0n;
  for (const h of history) {
    if (h.month >= from && h.month < month) before += h.assigned;
  }
  const share = shareOf(needed - before, monthsLeft);
  return {
    needed,
    funded: before + figures.assigned,
    underfunded: under(share, figures.assigned),
    monthAmount: share > 0n ? share : 0n,
    overfunded: over(figures, share),
    dueDate: period.due,
  };
}

const under = (needed: bigint, funded: bigint) => (funded < needed ? needed - funded : 0n);

/**
 * This month's share of what's still missing from a dated target, rounding up. When nothing is
 * missing (more is already in than the target), it's the surplus, below zero, so Reduce
 * Overfunding can take it back.
 */
const shareOf = (missing: bigint, monthsLeft: bigint) =>
  missing > 0n ? ceilDiv(missing, monthsLeft) : missing;

/**
 * What's over: this month's Assigned above what it has to reach (`due`), but never more than is
 * Available (YNAB: $150.00 assigned against $100.00 with $120.00 spent gave back $30.00).
 */
function over(figures: CategoryMonth, due: bigint) {
  const extra = figures.assigned - due;
  if (extra <= 0n || figures.available <= 0n) return 0n;
  return extra < figures.available ? extra : figures.available;
}

/**
 * The share of a target that's funded, in whole percent from 0 to 100, rounded down so it never
 * reads 100 before the target is met (YNAB's rounding is open in docs/verify.md).
 */
export function targetPercent(need: Pick<TargetNeed, "needed" | "funded">): number {
  if (need.funded >= need.needed) return 100;
  if (need.funded <= 0n) return 0;
  return Number((need.funded * 100n) / need.needed);
}
