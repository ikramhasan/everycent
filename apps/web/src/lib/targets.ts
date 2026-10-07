import type { components } from "@everycent/api-client";
import { type BudgetMonth, monthBounds } from "@everycent/engine";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { $api } from "./api";
import { apiErrorMessage } from "./budgets";
import { categoriesQueryOptions } from "./categories";
import { todayIso } from "./dates";
import { invalidateMonths } from "./months";

export type CategoryTarget = NonNullable<components["schemas"]["CategoryTarget"]>;
export type TargetNeed = NonNullable<components["schemas"]["TargetNeed"]>;
type SetTargetBody = components["schemas"]["SetCategoryTarget"];
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A target as the editor saves it, one shape per cadence. */
export type TargetInput = DistributiveOmit<SetTargetBody, "month">;
type Format = (minorUnits: string) => string;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export const WEEKDAY_OPTIONS = WEEKDAYS.map((label, value) => ({ value, label }));
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
export const MONTH_OPTIONS = MONTHS.map((label, i) => ({ value: i + 1, label }));

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
export function ordinal(n: number) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/**
 * The day a monthly target is due in `month`: its due day, or the month's last day (YNAB's "by the
 * 31st" in October, "by the 30th" in November). A day past the month's end is the last day.
 */
export function dueDayIn(dueDay: number | null, month: BudgetMonth) {
  const last = Number(monthBounds(month).end.slice(8));
  return dueDay === null || dueDay > last ? last : dueDay;
}

/** The days YNAB's "By" list offers, in its order: Last Day of Month, then 31st down to 1st. */
export const DUE_DAY_OPTIONS: { value: string; label: string }[] = [
  { value: "last", label: "Last Day of Month" },
  ...Array.from({ length: 31 }, (_, i) => 31 - i).map((d) => ({
    value: String(d),
    label: ordinal(d),
  })),
];

const monthLabel = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
/** YNAB's "Dec 30 2026". */
export const shortDate = (iso: string) =>
  `${monthLabel(iso).slice(0, 3)} ${Number(iso.slice(8))} ${iso.slice(0, 4)}`;
/** YNAB's "Dec 2026" for a balance target's month. */
const shortMonth = (iso: string) => `${monthLabel(iso).slice(0, 3)} ${iso.slice(0, 4)}`;

/**
 * Whether a target spreads a total over months up to a due date (yearly, custom, dated balance,
 * a card's pay off by date).
 */
export const isDated = (target: Pick<CategoryTarget, "cadence">) =>
  target.cadence === "yearly" || target.cadence === "custom" || target.cadence === "payoff_by_date";

/** Whether a target is one of a credit card payment category's two. */
export const isPaymentTarget = (target: Pick<CategoryTarget, "cadence">) =>
  target.cadence === "payment_monthly" || target.cadence === "payoff_by_date";

/** YNAB's names for the payment targets, in its form's order (Pay Off Balance by Date first). */
export const PAYMENT_TARGET_OPTIONS = [
  { value: "payoff_by_date", label: "Pay Off Balance by Date" },
  { value: "payment_monthly", label: "Pay Specific Amount Monthly" },
] as const;

/** A payment target's kind, which YNAB's inspector shows above its heading. */
export function paymentTargetKind(target: CategoryTarget) {
  return PAYMENT_TARGET_OPTIONS.find((o) => o.value === target.cadence)?.label ?? null;
}

/** "Each Month", "Every 2 Months", "Each Year", "Every 2 Years", or "" for a one-time target. */
function repeatPhrase(target: Pick<CategoryTarget, "repeatEvery" | "repeatUnit">) {
  if (!target.repeatEvery || !target.repeatUnit) return "";
  const unit = target.repeatUnit === "year" ? "Year" : "Month";
  return target.repeatEvery === 1 ? ` Each ${unit}` : ` Every ${target.repeatEvery} ${unit}s`;
}

/**
 * YNAB's inspector heading (docs/verify.md "Monthly targets", "Weekly, yearly and custom targets"):
 * "Set Aside Another $100.00 Each Month", "Refill Up to $10.00 Each Week", "Set Aside Another
 * $300.00 Every 2 Months", "Have a Balance of $300.00". Payment targets (docs/verify.md "Credit card
 * payment targets"): "$30.00" (Pay Specific Amount Monthly) and "Pay off $125.00" (Pay Off Balance
 * by Date, `amount` being what's still to pay off: what the target needs).
 */
export function targetHeading(target: CategoryTarget, amount: string) {
  if (target.cadence === "payment_monthly") return amount;
  if (target.cadence === "payoff_by_date") return `Pay off ${amount}`;
  if (target.behavior === "balance") return `Have a Balance of ${amount}`;
  const suffix =
    target.cadence === "weekly"
      ? " Each Week"
      : target.cadence === "monthly"
        ? " Each Month"
        : target.cadence === "yearly"
          ? " Each Year"
          : repeatPhrase(target);
  if (target.behavior === "set_aside") return `Set Aside Another ${amount}${suffix}`;
  // A custom target's "Fill up to" heading wasn't seen in YNAB (docs/verify.md).
  return target.cadence === "custom"
    ? `Fill Up to ${amount}${suffix}`
    : `Refill Up to ${amount}${suffix}`;
}

/**
 * YNAB's line under the heading: "By the End of the Month", "By the 15th of the Month", "By
 * Saturday", "By Dec 30 2026" (the current period's due date), "By Dec 2026", "Eventually"; for
 * payment targets "Each Month" and "By Mar 2027".
 */
export function targetDueLine(target: CategoryTarget, need: Pick<TargetNeed, "dueDate"> | null) {
  if (target.cadence === "payment_monthly") return "Each Month";
  if (target.cadence === "payoff_by_date") {
    return target.dueDate ? `By ${shortMonth(target.dueDate)}` : "";
  }
  if (target.cadence === "weekly") return `By ${WEEKDAYS[target.dueDay ?? 0]}`;
  if (target.cadence === "monthly") {
    return target.dueDay === null
      ? "By the End of the Month"
      : `By the ${ordinal(target.dueDay)} of the Month`;
  }
  if (target.behavior === "balance") {
    return target.dueDate ? `By ${shortMonth(target.dueDate)}` : "Eventually";
  }
  const due = need?.dueDate ?? target.dueDate;
  return due ? `By ${shortDate(due)}` : "";
}

/** Where a target stands this month: met, on track (this month's share is in), or underfunded. */
export function targetStatus(need: TargetNeed) {
  if (BigInt(need.funded) >= BigInt(need.needed)) return "met" as const;
  return need.underfunded === "0" ? ("onTrack" as const) : ("underfunded" as const);
}

/**
 * The note under a category's name (YNAB, docs/verify.md): "Funded" when met; "On Track" when this
 * month's share of a dated target is in; otherwise "$60.00 more needed by the 31st", "… this month"
 * (weekly, and dated targets before their due month), "… by December 30th" (a dated target's due
 * month), "$300.00 needed eventually" (a balance target without a date). Set aside always says
 * "more"; other targets only once something counts toward them.
 */
export function targetRowNote(
  target: CategoryTarget,
  need: TargetNeed,
  month: BudgetMonth,
  format: Format,
) {
  const status = targetStatus(need);
  if (status === "met") return { met: true, text: "Funded" };
  const more = target.behavior === "set_aside" || BigInt(need.funded) > 0n ? " more" : "";
  if (status === "onTrack") {
    if (target.behavior === "balance" && !target.dueDate) {
      const toGo = BigInt(need.needed) - BigInt(need.funded);
      return { met: false, text: `${format(toGo.toString())}${more} needed eventually` };
    }
    return { met: false, text: "On Track" };
  }
  const when =
    target.cadence === "monthly"
      ? `by the ${ordinal(dueDayIn(target.dueDay, month))}`
      : need.dueDate && need.dueDate.slice(0, 7) === month && target.behavior !== "balance"
        ? `by ${monthLabel(need.dueDate)} ${ordinal(Number(need.dueDate.slice(8)))}`
        : "this month";
  return { met: false, text: `${format(need.underfunded)}${more} needed ${when}` };
}

/**
 * The inspector's lines (YNAB): what's needed, what counts, and To Go (what's left of the total).
 * Pay Off Balance by Date shows the card's whole debt and Available (YNAB's "Needed for Payoff",
 * "Available for Payment"), which include this month's `fundedSpending`; the target leaves it out
 * of both, so To Go is the same.
 */
export function targetLines(
  target: CategoryTarget,
  need: TargetNeed,
  format: Format,
  fundedSpending = "0",
) {
  const toGo = BigInt(need.needed) - BigInt(need.funded);
  const toGoLine = { label: "To Go", value: format((toGo > 0n ? toGo : 0n).toString()) };
  if (target.cadence === "payoff_by_date") {
    const extra = BigInt(fundedSpending);
    return [
      { label: "Needed for Payoff", value: format((BigInt(need.needed) + extra).toString()) },
      { label: "Available for Payment", value: format((BigInt(need.funded) + extra).toString()) },
      toGoLine,
    ];
  }
  const due = need.dueDate ? shortDate(need.dueDate) : null;
  const setAside = target.behavior === "set_aside";
  const [neededLabel, fundedLabel] =
    target.behavior === "balance"
      ? [
          target.dueDate ? `Balance Needed by ${shortMonth(target.dueDate)}` : "Balance Needed",
          "Current Balance",
        ]
      : !isDated(target)
        ? setAside
          ? ["Amount to Assign This Month", "Assigned So Far"]
          : ["Needed This Month", "Funded"]
        : setAside
          ? [`Total to Assign by ${due}`, "Assigned So Far"]
          : [`Needed by ${due}`, "Funded"];
  return [
    { label: neededLabel, value: format(need.needed) },
    { label: fundedLabel, value: format(need.funded) },
    toGoLine,
  ];
}

/**
 * The inspector's message: "You've met your target!", "You're on track to meet your target!",
 * "Assign $333.34 this month to stay on track" (dated), "Assign $60.00 more to meet your target",
 * or nothing (a balance target without a date). `prompt` is the amount the Assign button adds.
 */
export function targetMessage(target: CategoryTarget, need: TargetNeed, format: Format) {
  const status = targetStatus(need);
  if (status === "met") return { text: "You've met your target!" };
  if (status === "onTrack") {
    return target.behavior === "balance" && !target.dueDate
      ? null
      : { text: "You're on track to meet your target!" };
  }
  const amount = format(need.underfunded);
  if (isDated(target)) return { prompt: amount, suffix: " this month to stay on track" };
  return {
    prompt: `${amount}${BigInt(need.funded) > 0n ? " more" : ""}`,
    suffix: " to meet your target",
  };
}

/** Create, replace and remove a category's target; failures show a toast. */
export function useTargetActions(budgetId: string) {
  const queryClient = useQueryClient();
  const put = $api.useMutation("put", "/v1/budgets/{budgetId}/categories/{categoryId}/target");
  const remove = $api.useMutation(
    "delete",
    "/v1/budgets/{budgetId}/categories/{categoryId}/target",
  );
  const snooze = $api.useMutation(
    "put",
    "/v1/budgets/{budgetId}/categories/{categoryId}/target/snooze",
  );
  return useMemo(() => {
    async function run(work: () => Promise<unknown>, failure: string) {
      try {
        await work();
        return true;
      } catch (error) {
        toast.error(apiErrorMessage(error, failure));
        return false;
      } finally {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: categoriesQueryOptions(budgetId).queryKey }),
          invalidateMonths(queryClient),
        ]);
      }
    }
    return {
      /** Saves the target from `month`, the month on screen. */
      save: (categoryId: string, month: BudgetMonth, input: TargetInput) =>
        run(
          () =>
            put.mutateAsync({
              params: { path: { budgetId, categoryId } },
              body: { ...input, month } as SetTargetBody,
            }),
          "Couldn't save the target.",
        ),
      remove: (categoryId: string) =>
        run(
          () => remove.mutateAsync({ params: { path: { budgetId, categoryId } } }),
          "Couldn't delete the target.",
        ),
      /** Snoozes the target for `month` (the current month), or wakes it. */
      snooze: (categoryId: string, month: BudgetMonth, snoozed: boolean) =>
        run(
          () =>
            snooze.mutateAsync({
              params: { path: { budgetId, categoryId } },
              body: { month, snoozed, today: todayIso() },
            }),
          snoozed ? "Couldn't snooze the target." : "Couldn't wake the target.",
        ),
    };
    // mutateAsync is stable; the mutation objects change every render.
  }, [budgetId, queryClient]);
}

type MonthBar = NonNullable<components["schemas"]["ProgressBar"]>;

/**
 * The note under a category that isn't overspent (YNAB, docs/verify.md "Snooze and progress
 * bars"). With a target that's working this month: its note ("Funded", "$60.00 more needed by the
 * 31st", …), a met one adding what was spent of its money ("Funded. Spent $30.00 of $100.00").
 * Without one (or snoozed): "Fully Spent" when spending used all the money, "Spent $7.00 of $20.00"
 * while some is left, nothing otherwise. `strong` is the part YNAB sets in bold.
 */
export function categoryRowNote(
  target: CategoryTarget | null,
  need: TargetNeed | null,
  bar: MonthBar | null,
  month: BudgetMonth,
  format: Format,
): { strong: string; rest: string } | null {
  let spent = 0n;
  let money = 0n;
  let left = 0n;
  for (const section of bar?.sections ?? []) {
    for (const g of section.segments) {
      if (g.kind === "spent") spent += BigInt(g.amount);
      if (g.kind === "available") left += BigInt(g.amount);
    }
  }
  money = spent + left;
  const spentOf = `Spent ${format(spent.toString())} of ${format(money.toString())}`;
  if (target && need && !need.snoozed) {
    const note = targetRowNote(target, need, month, format);
    if (!note.met) return { strong: "", rest: note.text };
    return { strong: note.text, rest: spent > 0n ? `. ${spentOf}` : "" };
  }
  if (spent === 0n) return null;
  return left === 0n ? { strong: "", rest: "Fully Spent" } : { strong: "", rest: spentOf };
}
