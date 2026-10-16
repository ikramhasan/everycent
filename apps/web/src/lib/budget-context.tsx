import { formatAmount, formatDate, type Money } from "@everycent/engine";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Budget } from "./budgets";

interface BudgetContextValue {
  budget: Budget;
  /** Formats with this budget's number format and symbol position. */
  formatAmount: (m: Money) => string;
  /** Formats a YYYY-MM-DD date with this budget's date format. */
  formatDate: (isoDate: string) => string;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

export function BudgetProvider({ budget, children }: { budget: Budget; children: ReactNode }) {
  const value = useMemo<BudgetContextValue>(
    () => ({
      budget,
      formatAmount: (m) => formatAmount(m, budget),
      formatDate: (isoDate) => formatDate(isoDate, budget.dateFormat),
    }),
    [budget],
  );
  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

/** The budget of the current `/budgets/$budgetId` route. */
export function useBudget(): BudgetContextValue {
  const value = useContext(BudgetContext);
  if (!value) throw new Error("useBudget must be used inside a budget route");
  return value;
}

/** The current budget, or null outside a budget route (e.g. a component rendered on its own). */
export function useOptionalBudget(): BudgetContextValue | null {
  return useContext(BudgetContext);
}
