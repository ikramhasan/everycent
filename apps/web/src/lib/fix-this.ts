import { addMonths, type BudgetMonth } from "@everycent/engine";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { FixThisMonths } from "@/components/move-money";
import type { CategoryList } from "./categories";
import { type BudgetMonthData, type MoneyOption, moneyOptions, monthQueryOptions } from "./months";

/**
 * The months YNAB's Fix This offers (checked 2026-10-11, docs/verify.md): none to pick from in a
 * past month; otherwise the current month through the last month with money assigned (or the
 * month on screen, if later), months with nothing assigned disabled. The current month offers each
 * category's Available; a later month what's assigned to it there.
 */
export function useFixThisMonths({
  budgetId,
  month,
  current,
  data,
  categories,
  unassign,
}: {
  budgetId: string;
  month: BudgetMonth;
  current: BudgetMonth;
  /** The month on screen. */
  data: BudgetMonthData | undefined;
  categories: CategoryList | undefined;
  unassign: FixThisMonths["unassign"];
}): FixThisMonths | undefined {
  const needed = Boolean(data && BigInt(data.readyToAssign) < 0n && !data.overdraft);
  const active = needed && month >= current;
  const currentData = useQuery({
    ...monthQueryOptions(budgetId, current),
    enabled: active && month !== current,
  }).data;
  const base = month === current ? data : currentData;
  const assignedMonths = new Set(base?.futureMonths.map((m) => m.month));
  const last = [...assignedMonths, month].reduce((a, b) => (b > a ? b : a), current);
  const later: BudgetMonth[] = [];
  for (let m = addMonths(current, 1); m <= last; m = addMonths(m, 1)) later.push(m);
  const laterData = useQueries({
    queries: later.map((m) => ({ ...monthQueryOptions(budgetId, m), enabled: active })),
  });

  if (!active || !base || !categories) return undefined;
  const byMonth = new Map<BudgetMonth, BudgetMonthData | undefined>(
    later.map((m, i) => [m, laterData[i]?.data]),
  );
  return {
    months: [
      { month: current, disabled: false },
      ...later.map((m) => ({ month: m, disabled: !assignedMonths.has(m) && m !== month })),
    ],
    initial: month,
    optionsFor: (m) => {
      if (m === current) return moneyOptions(categories, base);
      const monthData = byMonth.get(m);
      return monthData && assignedOptions(categories, monthData);
    },
    unassign,
  };
}

/** The visible categories with money assigned in `month`, offering that amount. */
function assignedOptions(list: CategoryList, month: BudgetMonthData): MoneyOption[] {
  const assigned = new Map(month.categories.map((c) => [c.categoryId, c.assigned]));
  return list.groups
    .filter((g) => !g.hidden)
    .flatMap((g) =>
      g.categories
        .filter((c) => !c.hidden)
        .map((c) => ({
          id: c.id,
          name: c.name,
          group: g.name,
          available: assigned.get(c.id) ?? "0",
        })),
    );
}
