import { cn } from "@everycent/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useBudget } from "@/lib/budget-context";

/** YNAB's five Reflect reports, in its tab order (2026-10-14). */
export const PARITY_REPORTS = [
  { to: "/budgets/$budgetId/reports/spending-breakdown", label: "Spending Breakdown" },
  { to: "/budgets/$budgetId/reports/spending-trends", label: "Spending Trends" },
  { to: "/budgets/$budgetId/reports/net-worth", label: "Net Worth" },
  { to: "/budgets/$budgetId/reports/income-expense", label: "Income v Expense" },
  { to: "/budgets/$budgetId/reports/age-of-money", label: "Age of Money" },
] as const;

/** YNAB's report tabs, kept reachable from every report. */
export function ReportsNav() {
  const { budget } = useBudget();
  return (
    <nav aria-label="Reports" className="-mx-4 overflow-x-auto border-b px-4 md:-mx-6 md:px-6">
      <ul className="flex gap-4">
        <li>
          <Link
            to="/budgets/$budgetId/reports"
            params={{ budgetId: budget.id }}
            activeOptions={{ exact: true }}
            className="block whitespace-nowrap border-transparent border-b-2 py-2 text-muted-foreground text-sm hover:text-foreground data-active:border-primary data-active:text-foreground"
            activeProps={{ "data-active": true }}
          >
            Overview
          </Link>
        </li>
        {PARITY_REPORTS.map((r) => (
          <li key={r.to}>
            <Link
              to={r.to}
              params={{ budgetId: budget.id }}
              className="block whitespace-nowrap border-transparent border-b-2 py-2 text-muted-foreground text-sm hover:text-foreground data-active:border-primary data-active:text-foreground"
              activeProps={{ "data-active": true }}
            >
              {r.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A report's frame: the tabs, its title with actions (Export) and filters, then its content. */
export function ReportPage({
  title,
  actions,
  filters,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("mx-auto grid w-full max-w-6xl content-start gap-4 p-4 md:p-6", className)}>
      <ReportsNav />
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="font-semibold text-2xl">{title}</h1>
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </header>
      {filters}
      {children}
    </main>
  );
}
