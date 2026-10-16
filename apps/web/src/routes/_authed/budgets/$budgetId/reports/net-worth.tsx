import { createFileRoute } from "@tanstack/react-router";
import { ReportPage } from "@/components/reports/report-page";
import { reportSearchSchema } from "@/lib/reports";

export const Route = createFileRoute("/_authed/budgets/$budgetId/reports/net-worth")({
  validateSearch: reportSearchSchema,
  component: Report,
});

/** YNAB's Net Worth report (EVERYCENT-79). */
function Report() {
  return (
    <ReportPage title="Net Worth">
      <p className="text-muted-foreground text-sm">Coming soon.</p>
    </ReportPage>
  );
}
