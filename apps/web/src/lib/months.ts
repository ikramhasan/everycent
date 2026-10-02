import type { components } from "@everycent/api-client";
import { type BudgetMonth, type CurrencyCode, type Money, money, monthOf } from "@everycent/engine";
import type { QueryClient } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { useCallback, useState } from "react";
import { $api } from "./api";
import { todayIso } from "./dates";

export type BudgetMonthData = components["schemas"]["BudgetMonth"];
export type MonthTotals = components["schemas"]["MonthTotals"];

/** Activity leaves out transactions dated after the user's today. */
export const monthQueryOptions = (budgetId: string, month: BudgetMonth, today = todayIso()) =>
  $api.queryOptions("get", "/v1/budgets/{budgetId}/months/{month}", {
    params: { path: { budgetId, month }, query: { today } },
  });

/** Refetches every month: call after anything that changes assigned amounts or activity. */
export function invalidateMonths(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    queryKey: ["get", "/v1/budgets/{budgetId}/months/{month}"],
  });
}

export const currentMonth = (now = new Date()) => monthOf(todayIso(now));

/** "Oct 2026", as YNAB labels the month. */
export function monthLabel(month: BudgetMonth) {
  return format(parse(month, "yyyy-MM", new Date()), "MMM yyyy");
}

/** "November", as YNAB names a month in lists. */
export function monthName(month: BudgetMonth) {
  return format(parse(month, "yyyy-MM", new Date()), "MMMM");
}

export const toMoney = (amount: string, currency: CurrencyCode): Money =>
  money(BigInt(amount), currency);

function readCollapsed(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Collapsed category groups. YNAB keeps them collapsed across reloads and months; where it keeps
 * them (account or browser) is open in docs/verify.md, so this browser it is for now.
 */
export function useCollapsedGroups(budgetId: string) {
  const key = `everycent:collapsed-groups:${budgetId}`;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(readCollapsed(key)),
  );
  const update = useCallback(
    (next: ReadonlySet<string>) => {
      setCollapsed(next);
      try {
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        // Storage can be unavailable (private windows); the state still works for this visit.
      }
    },
    [key],
  );
  return { collapsed, setCollapsed: update };
}
