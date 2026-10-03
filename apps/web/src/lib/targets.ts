import type { components } from "@everycent/api-client";
import { type BudgetMonth, monthBounds } from "@everycent/engine";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { $api } from "./api";
import { apiErrorMessage } from "./budgets";
import { categoriesQueryOptions } from "./categories";
import { invalidateMonths } from "./months";

export type CategoryTarget = NonNullable<components["schemas"]["CategoryTarget"]>;
export type TargetNeed = NonNullable<components["schemas"]["TargetNeed"]>;
export type TargetInput = Pick<CategoryTarget, "behavior" | "amount" | "dueDay">;

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

/** YNAB's inspector heading: "Set Aside Another $100.00 Each Month". */
export function targetHeading(target: Pick<CategoryTarget, "behavior">, amount: string) {
  return target.behavior === "set_aside"
    ? `Set Aside Another ${amount} Each Month`
    : `Refill Up to ${amount} Each Month`;
}

/** YNAB's line under it: "By the End of the Month" or "By the 15th of the Month". */
export function targetDueLine(dueDay: number | null) {
  return dueDay === null ? "By the End of the Month" : `By the ${ordinal(dueDay)} of the Month`;
}

/**
 * The note under a category's name (YNAB, docs/verify.md "Monthly targets"): "Funded" when met,
 * otherwise "$60.00 more needed by the 31st". A refill target with nothing counted yet says
 * "$100.00 needed"; set aside always says "more".
 */
export function targetRowNote(
  target: Pick<CategoryTarget, "behavior" | "dueDay">,
  need: TargetNeed,
  month: BudgetMonth,
  format: (minorUnits: string) => string,
) {
  if (need.underfunded === "0") return { met: true, text: "Funded" };
  const more = target.behavior === "set_aside" || BigInt(need.funded) > 0n ? " more" : "";
  return {
    met: false,
    text: `${format(need.underfunded)}${more} needed by the ${ordinal(dueDayIn(target.dueDay, month))}`,
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
              body: { cadence: "monthly", month, ...input },
            }),
          "Couldn't save the target.",
        ),
      remove: (categoryId: string) =>
        run(
          () => remove.mutateAsync({ params: { path: { budgetId, categoryId } } }),
          "Couldn't delete the target.",
        ),
    };
    // mutateAsync is stable; the mutation objects change every render.
  }, [budgetId, queryClient]);
}
