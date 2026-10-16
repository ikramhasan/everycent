import {
  addMonths,
  type BudgetMonth,
  type CategorySpending,
  currencyExponent,
  monthsIn,
  type ObservationInput,
  observations,
  percentOf,
} from "@everycent/engine";
import { useQuery } from "@tanstack/react-query";
import { categoriesQueryOptions } from "./categories";
import { monthQueryOptions } from "./months";
import { currentMonth, type ReportSum, reportActivityOptions } from "./reports";

/** Spending per month, positive (YNAB's Total Spending: minus the months' category nets). */
export function spentByMonth(rows: readonly ReportSum[]): Map<BudgetMonth, bigint> {
  const spent = new Map<BudgetMonth, bigint>();
  for (const r of rows) {
    const month = r.month as BudgetMonth;
    spent.set(month, (spent.get(month) ?? 0n) - BigInt(r.net));
  }
  return spent;
}

/** Income per month. */
export function incomeByMonth(rows: readonly ReportSum[]): Map<BudgetMonth, bigint> {
  const income = new Map<BudgetMonth, bigint>();
  for (const r of rows) {
    const month = r.month as BudgetMonth;
    income.set(month, (income.get(month) ?? 0n) + BigInt(r.net));
  }
  return income;
}

/** A month's savings rate in percent (display only): what income wasn't spent. */
export const savingsRate = (income: bigint, spent: bigint) =>
  income > 0n ? percentOf(income - spent, income) : null;

/**
 * Each category's spending this month and in the 6 months before (for the "above average" rule),
 * from sums grouped by month and category. Months without spending count as zero once the
 * category has spent before.
 */
export function categorySpending(
  rows: readonly ReportSum[],
  month: BudgetMonth,
  names: ReadonlyMap<string, string>,
): CategorySpending[] {
  const previousMonths = monthsIn({ from: addMonths(month, -6), to: addMonths(month, -1) });
  const byCategory = new Map<string, Map<string, bigint>>();
  for (const r of rows) {
    if (!r.categoryId) continue;
    const months = byCategory.get(r.categoryId) ?? new Map<string, bigint>();
    months.set(r.month ?? "", -BigInt(r.net));
    byCategory.set(r.categoryId, months);
  }
  return [...byCategory].map(([categoryId, months]) => {
    const first = previousMonths.findIndex((m) => months.has(m));
    return {
      categoryId,
      name: names.get(categoryId) ?? "",
      spent: months.get(month) ?? 0n,
      previous: first < 0 ? [] : previousMonths.slice(first).map((m) => months.get(m) ?? 0n),
    };
  });
}

/** Months the home's sparklines cover: the last 12, this one included. */
export const homeRange = (month: BudgetMonth) => ({ from: addMonths(month, -11), to: month });

/**
 * Everything the Reports home reads that the reports endpoints already give: monthly spending and
 * income, categories' spending, this month's payees and overspending.
 */
export function useReportsHomeData(
  budgetId: string,
  extra: Pick<ObservationInput, "netWorth"> = {},
) {
  const month = currentMonth();
  const range = homeRange(month);
  const spending = useQuery(reportActivityOptions({ budgetId, range, groupBy: ["month"] }));
  const income = useQuery(
    reportActivityOptions({ budgetId, range, kind: "income", groupBy: ["month"] }),
  );
  const byCategory = useQuery(
    reportActivityOptions({
      budgetId,
      range: { from: addMonths(month, -6), to: month },
      groupBy: ["month", "category"],
    }),
  );
  const payees = useQuery(
    reportActivityOptions({ budgetId, range: { from: month, to: month }, groupBy: ["payee"] }),
  );
  const earlierPayees = useQuery(
    reportActivityOptions({
      budgetId,
      range: { from: addMonths(month, -12), to: addMonths(month, -1) },
      groupBy: ["payee"],
    }),
  );
  const plan = useQuery(monthQueryOptions(budgetId, month));
  const categories = useQuery(categoriesQueryOptions(budgetId));

  const names = new Map(
    (categories.data?.groups ?? []).flatMap((g) =>
      g.categories.map((c) => [c.id, c.name] as const),
    ),
  );
  if (categories.data) names.set(categories.data.uncategorizedCategoryId, "Uncategorized");
  const payeeNames = new Map((payees.data?.payees ?? []).map((p) => [p.id, p.name]));
  const spent = spentByMonth(spending.data?.rows ?? []);
  const earned = incomeByMonth(income.data?.rows ?? []);
  const ready =
    spending.data &&
    income.data &&
    byCategory.data &&
    payees.data &&
    earlierPayees.data &&
    plan.data &&
    categories.data;

  const notes = ready
    ? observations({
        month,
        categories: categorySpending(byCategory.data.rows, month, names),
        overspent: plan.data.categories.flatMap((c) =>
          BigInt(c.available) < 0n
            ? [
                {
                  categoryId: c.categoryId,
                  name: names.get(c.categoryId) ?? "",
                  overspent: -BigInt(c.available),
                },
              ]
            : [],
        ),
        netWorth: extra.netWorth,
        income: earned,
        topPayees: payees.data.rows
          .flatMap((r) =>
            r.payeeId && BigInt(r.net) < 0n
              ? [
                  {
                    payeeId: r.payeeId,
                    name: payeeNames.get(r.payeeId) ?? "",
                    spent: -BigInt(r.net),
                  },
                ]
              : [],
          )
          .sort((a, b) => (a.spent > b.spent ? -1 : a.spent < b.spent ? 1 : 0)),
        knownPayees: new Set(
          earlierPayees.data.rows.flatMap((r) => (r.payeeId ? [r.payeeId] : [])),
        ),
        // $25 (in the budget's currency): smaller amounts above average aren't worth a note.
        minimumSpend: 25n * 10n ** BigInt(currencyExponent(plan.data.currency)),
      })
    : [];

  return {
    month,
    loading: !ready,
    months: monthsIn(range),
    spent,
    earned,
    categoryNames: names,
    byCategory: byCategory.data?.rows ?? [],
    observations: notes,
  };
}
