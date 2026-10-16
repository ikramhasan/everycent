import { createFileRoute } from "@tanstack/react-router";
import { ReportPage } from "@/components/reports/report-page";
import { reportSearchSchema } from "@/lib/reports";

export const Route = createFileRoute("/_authed/budgets/$budgetId/reports/spending-trends")({
  validateSearch: reportSearchSchema,
  component: Report,
});

/** YNAB's Spending Trends report (EVERYCENT-78). */
function Report() {
  return (
    <ReportPage title="Spending Trends">
      <p className="text-muted-foreground text-sm">Coming soon.</p>
    </ReportPage>
  );
}
