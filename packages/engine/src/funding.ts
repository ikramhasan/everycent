import { type BudgetMonth, monthOf } from "./months";
import { type CategoryTarget, type TargetNeed, weekdaysIn } from "./targets";

/**
 * Underfunded's order when it can't fund everything (support.ynab.com "Underfunded"): overspent
 * categories first, then what's due on a date this month (weekly occurrences, monthly targets with
 * a due day, dated targets due this month) by date, then monthly targets due at the end of the
 * month, then dated targets due in a later month by due date, then credit card payments. Within a
 * step, categories go top to bottom.
 */
export const FUNDING_STEPS = {
  overspent: 1,
  dueThisMonth: 2,
  endOfMonth: 3,
  dueLater: 4,
  cardPayment: 5,
} as const;
export type FundingStep = (typeof FUNDING_STEPS)[keyof typeof FUNDING_STEPS];

/** One piece of what a category asks for, with its place in Underfunded's order. */
export interface FundingPart {
  amount: bigint;
  step: FundingStep;
  /** YYYY-MM-DD the part is due, or "" when the step doesn't order by date. */
  date: string;
}

/**
 * A category's scheduled transactions still to come in the month (YNAB's "Upcoming
 * Transactions"): their net amount (negative when more goes out than comes in) and the earliest
 * one's date.
 */
export interface Upcoming {
  amount: bigint;
  date: string;
}

/** What the upcoming transactions need beyond Available (YNAB's "Available After Upcoming"). */
export function upcomingShort(available: bigint, upcoming: Upcoming | null | undefined): bigint {
  if (!upcoming || upcoming.amount >= 0n) return 0n;
  const short = -upcoming.amount - available;
  return short > 0n ? short : 0n;
}

export interface CategoryFunding {
  /** What Underfunded adds to the category's Assigned when it can fund it in full. */
  underfunded: bigint;
  /** What Reduce Overfunding takes back from its Assigned. */
  overfunded: bigint;
  /** `underfunded` split into the pieces Underfunded funds in order (they add up to it). */
  parts: FundingPart[];
}

const NONE: CategoryFunding = { underfunded: 0n, overfunded: 0n, parts: [] };

const lastDay = (month: BudgetMonth) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const dayOf = (month: BudgetMonth, day: number) =>
  `${month}-${String(Math.min(day, lastDay(month))).padStart(2, "0")}`;

/** The dates `weekday` (0 = Sunday) falls on in `month`. */
function weekdayDates(month: BudgetMonth, weekday: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const offset = (weekday - first + 7) % 7;
  return Array.from({ length: weekdaysIn(month, weekday) }, (_, i) =>
    dayOf(month, 1 + offset + i * 7),
  );
}

/**
 * What Underfunded and Reduce Overfunding do to a spending category in `month` (YNAB, checked in
 * its web app on 2026-10-07, docs/verify.md "Underfunded and Reduce Overfunding"):
 * - Underfunded assigns enough to meet the target and to cover any overspending, whichever is more
 *   (O11: $100.00 target, $30.00 overspent → $100.00; O13: met, $30.00 overspent → $30.00). A
 *   category without a target only gets its overspending covered.
 * - Reduce Overfunding takes back what the target says is over (`TargetNeed.overfunded`).
 * - A snoozed target asks for nothing, but its overspending is still covered and what's over can
 *   still be taken back (YNAB, 2026-10-07: snoozed O11 asked $30.00, snoozed O9 gave back $50.00).
 * - Upcoming scheduled transactions ask for what Available doesn't cover, or the target's need if
 *   that's more (YNAB, 2026-10-12: U10 D, a $40.00 target and $30.00 scheduled, asked $40.00; U10
 *   I, target met at $40.00 with $60.00 scheduled, $20.00), snoozed or not (support.ynab.com). The
 *   whole amount is funded at the earliest upcoming date ("C4 Order FS": X10's $10.00 target and
 *   $6.00 on 10/16 went before $6.00 due 10/20).
 */
export function spendingFunding(
  month: BudgetMonth,
  available: bigint,
  target: Pick<CategoryTarget, "cadence" | "dueDay"> | null,
  need: TargetNeed | null,
  snoozed = false,
  upcoming: Upcoming | null = null,
): CategoryFunding {
  const overspent = available < 0n ? -available : 0n;
  const short = snoozed ? 0n : (need?.underfunded ?? 0n);
  const scheduled = upcomingShort(available, upcoming);
  const underfunded = [short, overspent, scheduled].reduce((a, b) => (b > a ? b : a));
  const overfunded = need?.overfunded ?? 0n;
  if (underfunded === 0n) return { ...NONE, overfunded };
  if (overspent > 0n || ((!target || !need) && scheduled === 0n)) {
    return {
      underfunded,
      overfunded,
      parts: [{ amount: underfunded, step: FUNDING_STEPS.overspent, date: "" }],
    };
  }
  if (scheduled > 0n && upcoming) {
    return {
      underfunded,
      overfunded,
      parts: [{ amount: underfunded, step: FUNDING_STEPS.dueThisMonth, date: upcoming.date }],
    };
  }
  if (!target || !need) return { ...NONE, overfunded };
  return { underfunded, overfunded, parts: targetParts(month, target, need) };
}

/** A target's shortfall placed in Underfunded's order. */
function targetParts(
  month: BudgetMonth,
  target: Pick<CategoryTarget, "cadence" | "dueDay">,
  need: TargetNeed,
): FundingPart[] {
  const amount = need.underfunded;
  if (target.cadence === "weekly") {
    // Each week's occurrence is due on its own date; what's assigned so far covers the earliest.
    const dates = weekdayDates(month, target.dueDay ?? 0);
    const perWeek = dates.length ? need.needed / BigInt(dates.length) : amount;
    const parts: FundingPart[] = [];
    let left = amount;
    for (let i = dates.length - 1; i >= 0 && left > 0n; i--) {
      const part = i === 0 || left < perWeek ? left : perWeek;
      parts.unshift({ amount: part, step: FUNDING_STEPS.dueThisMonth, date: dates[i] ?? "" });
      left -= part;
    }
    return parts;
  }
  if (target.cadence === "monthly") {
    return [
      target.dueDay === null
        ? { amount, step: FUNDING_STEPS.endOfMonth, date: "" }
        : { amount, step: FUNDING_STEPS.dueThisMonth, date: dayOf(month, target.dueDay) },
    ];
  }
  const due = need.dueDate ?? "";
  return [
    {
      amount,
      step: due && monthOf(due) === month ? FUNDING_STEPS.dueThisMonth : FUNDING_STEPS.dueLater,
      date: due,
    },
  ];
}

/**
 * What Underfunded and Reduce Overfunding do to a credit card's payment category (YNAB, checked
 * in its web app on 2026-10-07), without a target:
 * - Underfunded assigns what the card owes beyond Available, less this month's credit overspending
 *   on it (covering those categories moves that money in): Card B owed $103.00 with $3.00 → $100.00;
 *   Card X owed nothing with −$10.00 → $10.00; Visa owed $65.00, had $31.00 and $33.00 of credit
 *   overspending → $1.00.
 * - Reduce Overfunding takes back Available above what's owed (Amex, paid off, $6.00 → $6.00).
 *
 * With a target that applies this month, both follow the target instead (support.ynab.com: "the
 * Underfunded alert will function on that target instead of your working balance"; checked
 * 2026-10-08): Card E3 ($30.00 a month, $5.00 credit overspending) asked $30.00; Card E1 (pay off
 * by date) asked its share, $20.84; Card E2, red at −$10.00, still asked its $33.34 share (the
 * overspending, if more, is covered too). Assigning $50.00 gave back $20.00 (E3) and $29.16 (E1).
 *
 * A scheduled payment asks for what Available doesn't cover, or the above if more (YNAB,
 * 2026-10-12: Card W owed $10.00 with a $5.00 payment scheduled, still $10.00), and puts the card
 * first among card payments (support.ynab.com: those with a scheduled payment come first).
 */
export function paymentFunding(
  available: bigint,
  owed: bigint,
  creditOverspending: bigint,
  need: TargetNeed | null = null,
  upcoming: Upcoming | null = null,
): CategoryFunding {
  let underfunded: bigint;
  let overfunded: bigint;
  if (need) {
    const overspent = available < 0n ? -available : 0n;
    underfunded = need.underfunded > overspent ? need.underfunded : overspent;
    overfunded = need.overfunded;
  } else {
    const short = owed - available - creditOverspending;
    const extra = available - owed;
    underfunded = short > 0n ? short : 0n;
    overfunded = extra > 0n ? extra : 0n;
  }
  const scheduled = upcomingShort(available, upcoming);
  if (scheduled > underfunded) underfunded = scheduled;
  const date = upcoming && upcoming.amount < 0n ? upcoming.date : "";
  return {
    underfunded,
    overfunded,
    parts: underfunded ? [{ amount: underfunded, step: FUNDING_STEPS.cardPayment, date }] : [],
  };
}

/**
 * Underfunded over many categories with only `readyToAssign` to give: each part in YNAB's order
 * (step, then date, undated parts last, then the categories' order as listed) gets what's left
 * until nothing is.
 * Returns what each category gets. Categories come in list order.
 */
export function fundUnderfunded(
  categories: readonly { categoryId: string; parts: readonly FundingPart[] }[],
  readyToAssign: bigint,
): Map<string, bigint> {
  const queue = categories.flatMap((c, index) =>
    c.parts.map((part) => ({ ...part, index, id: c.categoryId })),
  );
  queue.sort((a, b) =>
    a.step !== b.step
      ? a.step - b.step
      : a.date !== b.date
        ? a.date === "" || (b.date !== "" && a.date > b.date)
          ? 1
          : -1
        : a.index - b.index,
  );
  const given = new Map<string, bigint>();
  let left = readyToAssign;
  for (const part of queue) {
    if (left <= 0n) break;
    const amount = part.amount < left ? part.amount : left;
    given.set(part.id, (given.get(part.id) ?? 0n) + amount);
    left -= amount;
  }
  return given;
}
