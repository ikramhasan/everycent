import type { components } from "@everycent/api-client";
import { addMonths, type BudgetMonth } from "@everycent/engine";
import { z } from "zod";
import { $api } from "./api";
import { todayIso } from "./dates";
import { reportSearchSchema } from "./reports";

export type AgeOfMoney = components["schemas"]["AgeOfMoney"];
export type AgeOfMoneyMonth = AgeOfMoney["months"][number];

/** The history spans YNAB's web report offers (help center: 6 months, 1 year, 2 years). */
export const AGE_OF_MONEY_SPANS = ["6m", "1y", "2y"] as const;
export type AgeOfMoneySpan = (typeof AGE_OF_MONEY_SPANS)[number];
export const SPAN_LABELS: Record<AgeOfMoneySpan, string> = { "6m": "6M", "1y": "1Y", "2y": "2Y" };
const SPAN_MONTHS: Record<AgeOfMoneySpan, number> = { "6m": 6, "1y": 12, "2y": 24 };

/** The report's URL: the shared report search plus the history span. */
export const ageOfMoneySearchSchema = reportSearchSchema.extend({
  span: z.enum(AGE_OF_MONEY_SPANS).optional().catch(undefined),
});

/** Age of Money now, 30 days ago and per month (`GET /reports/age-of-money`). */
export const ageOfMoneyOptions = (budgetId: string) =>
  $api.queryOptions("get", "/v1/budgets/{budgetId}/reports/age-of-money", {
    params: { path: { budgetId }, query: { today: todayIso() } },
  });

/** "1 day", "14 days". */
export const daysLabel = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

/**
 * The months a span shows, ending with the current month (the last one the API returns). `all`
 * keeps months without a value (the table); otherwise they're left out, as YNAB's chart leaves
 * out months with fewer than ten outflows.
 */
export function spanMonths(
  months: readonly AgeOfMoneyMonth[],
  span: AgeOfMoneySpan,
  { all = false } = {},
): AgeOfMoneyMonth[] {
  const last = months.at(-1);
  if (!last) return [];
  const first = addMonths(last.month as BudgetMonth, 1 - SPAN_MONTHS[span]);
  return months.filter((m) => m.month >= first && (all || m.days !== null));
}

/** The change since 30 days ago, in words, or null when either value is missing. */
export function changeLabel(current: number | null, before: number | null): string | null {
  if (current === null || before === null) return null;
  const diff = current - before;
  if (diff === 0) return "Same as 30 days ago";
  return `${diff > 0 ? "Up" : "Down"} ${daysLabel(Math.abs(diff))} from 30 days ago`;
}
