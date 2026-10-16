import { createFileRoute } from "@tanstack/react-router";
import { ReportPage } from "@/components/reports/report-page";
import { reportSearchSchema } from "@/lib/reports";

export const Route = createFileRoute("/_authed/budgets/$budgetId/reports/spending-breakdown")({
  validateSearch: reportSearchSchema,
  component: Report,
});

/** YNAB's Spending Breakdown report (EVERYCENT-77). */
function Report() {
  return (
    <ReportPage title="Spending Breakdown">
      <p className="text-muted-foreground text-sm">Coming soon.</p>
    </ReportPage>
  );
}
