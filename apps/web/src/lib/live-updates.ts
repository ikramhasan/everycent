import { type Query, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * This browser tab, sent with every request (`X-Client-Id`) so the budget's event stream can
 * tell the tab which changes were its own.
 */
export const CLIENT_ID = crypto.randomUUID();

/** How long to gather a burst of changes (a bulk edit, a partner typing) into one refetch. */
const SETTLE_MS = 300;

/** Whether a query shows this budget's data: its key names the budget (or lists budgets). */
export function isBudgetQuery(query: Pick<Query, "queryKey">, budgetId: string): boolean {
  const [method, path] = query.queryKey;
  if (method === "get" && path === "/v1/budgets") return true;
  return JSON.stringify(query.queryKey).includes(budgetId);
}

/**
 * Live updates (EVERYCENT-90, an everycent extra; YNAB re-syncs every 3 minutes): listens to the
 * budget's event stream and refetches what's on screen when someone else changes the budget.
 * Changes this tab made are skipped (it already refreshes after its own). EventSource reconnects
 * by itself; a reconnect refetches too, in case something was missed while offline.
 */
export function useBudgetEvents(budgetId: string, baseUrl: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refetch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ predicate: (q) => isBudgetQuery(q, budgetId) });
      }, SETTLE_MS);
    };
    const source = new EventSource(`${baseUrl}/v1/budgets/${budgetId}/events`, {
      withCredentials: true,
    });
    let opened = false;
    source.addEventListener("open", () => {
      if (opened) refetch();
      opened = true;
    });
    source.addEventListener("change", (event) => {
      try {
        const { clientId } = JSON.parse((event as MessageEvent<string>).data) as {
          clientId: string | null;
        };
        if (clientId === CLIENT_ID) return;
      } catch {
        // An unreadable event still means something changed.
      }
      refetch();
    });
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [budgetId, baseUrl, queryClient]);
}
