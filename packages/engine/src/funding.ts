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
 */
export function spendingFunding(
  month: BudgetMonth,
  available: bigint,
  target: Pick<CategoryTarget, "cadence" | "dueDay"> | null,
  need: TargetNeed | null,
): CategoryFunding {
  const overspent = available < 0n ? -available : 0n;
  const short = need?.underfunded ?? 0n;
  const underfunded = short > overspent ? short : overspent;
  const overfunded = need?.overfunded ?? 0n;
  if (underfunded === 0n) return { ...NONE, overfunded };
  if (overspent > 0n || !target || !need) {
    return {
      underfunded,
      overfunded,
      parts: [{ amount: underfunded, step: FUNDING_STEPS.overspent, date: "" }],
    };
  }
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
 * in its web app on 2026-10-07):
 * - Underfunded assigns what the card owes beyond Available, less this month's credit overspending
 *   on it (covering those categories moves that money in): Card B owed $103.00 with $3.00 → $100.00;
 *   Card X owed nothing with −$10.00 → $10.00; Visa owed $65.00, had $31.00 and $33.00 of credit
 *   overspending → $1.00.
 * - Reduce Overfunding takes back Available above what's owed (Amex, paid off, $6.00 → $6.00).
 */
export function paymentFunding(
  available: bigint,
  owed: bigint,
  creditOverspending: bigint,
): CategoryFunding {
  const short = owed - available - creditOverspending;
  const extra = available - owed;
  const underfunded = short > 0n ? short : 0n;
  return {
    underfunded,
    overfunded: extra > 0n ? extra : 0n,
    parts: underfunded ? [{ amount: underfunded, step: FUNDING_STEPS.cardPayment, date: "" }] : [],
  };
}

/**
 * Underfunded over many categories with only `readyToAssign` to give: each part in YNAB's order
 * (step, then date, then the categories' order as listed) gets what's left until nothing is.
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
        ? a.date < b.date
          ? -1
          : 1
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
