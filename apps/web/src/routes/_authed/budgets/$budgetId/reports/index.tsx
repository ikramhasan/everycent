import { createFileRoute, Link } from "@tanstack/react-router";
import { PARITY_REPORTS, ReportPage } from "@/components/reports/report-page";
import { useBudget } from "@/lib/budget-context";

export const Route = createFileRoute("/_authed/budgets/$budgetId/reports/")({
  component: ReportsHome,
});

/** The Reports home (EVERYCENT-184): for now, the list of reports. */
function ReportsHome() {
  const { budget } = useBudget();
  return (
    <ReportPage title="Reports">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {PARITY_REPORTS.map((r) => (
          <li key={r.to}>
            <Link
              to={r.to}
              params={{ budgetId: budget.id }}
              className="block rounded-lg border p-4 font-medium hover:bg-muted"
            >
              {r.label}
            </Link>
          </li>
        ))}
      </ul>
    </ReportPage>
  );
}
