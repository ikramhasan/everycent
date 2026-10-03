import { z } from "zod";
import { type BudgetMonth, categoryMonth, type MonthFigures } from "./months";

/**
 * What a monthly target asks for once a month has money (YNAB's "Next month I want to"):
 * - set_aside: "Set aside another…": the full amount every month; money carried in doesn't count.
 * - refill: "Refill up to…": only what it takes to bring the category back up to the amount.
 */
export const TARGET_BEHAVIORS = ["set_aside", "refill"] as const;
export type TargetBehavior = (typeof TARGET_BEHAVIORS)[number];
export const zTargetBehavior = z.enum(TARGET_BEHAVIORS);

/** Target cadences built so far (weekly, yearly and custom come with phase 8b). */
export const TARGET_CADENCES = ["monthly"] as const;
export type TargetCadence = (typeof TARGET_CADENCES)[number];
export const zTargetCadence = z.enum(TARGET_CADENCES);

export interface CategoryTarget {
  cadence: TargetCadence;
  behavior: TargetBehavior;
  /** Minor units asked for each month. */
  amount: bigint;
  /** Day of the month it's due (1–31); null is the last day. Only changes the wording. */
  dueDay: number | null;
  /** The first month the target applies to (YNAB's goal creation month). */
  startMonth: BudgetMonth;
}

export interface TargetNeed {
  /** What the target asks for this month (YNAB's "Amount to Assign This Month" / "Needed"). */
  needed: bigint;
  /** What counts toward it (YNAB's "Assigned So Far" / "Funded"); can be negative. */
  funded: bigint;
  /** What's still to assign (YNAB's "To Go"), never below zero. */
  underfunded: bigint;
}

/**
 * What a category's target asks for in `month`, from the category's history (YNAB, checked
 * through its API and web app on 2026-10-03, docs/verify.md "Monthly targets"):
 * - Nothing before the target's start month (null).
 * - Set aside another: only this month's Assigned counts, whatever was carried in, spent or
 *   refunded.
 * - Refill up to: what was carried in plus this month's Assigned counts; this month's spending and
 *   refunds don't. In a month after `currentMonth` (the user's month) carried money doesn't count
 *   yet: leftover money only counts once the month begins.
 */
export function targetNeed(
  history: readonly MonthFigures[],
  target: CategoryTarget,
  month: BudgetMonth,
  currentMonth: BudgetMonth,
): TargetNeed | null {
  if (month < target.startMonth) return null;
  const figures = categoryMonth(history, month);
  const funded =
    target.behavior === "refill" && month <= currentMonth
      ? figures.carried + figures.assigned
      : figures.assigned;
  const needed = target.amount;
  return { needed, funded, underfunded: funded < needed ? needed - funded : 0n };
}

/**
 * The share of a target that's funded, in whole percent from 0 to 100, rounded down so it never
 * reads 100 before the target is met (YNAB's rounding is open in docs/verify.md).
 */
export function targetPercent(need: TargetNeed): number {
  if (need.underfunded === 0n) return 100;
  if (need.funded <= 0n) return 0;
  return Number((need.funded * 100n) / need.needed);
}
