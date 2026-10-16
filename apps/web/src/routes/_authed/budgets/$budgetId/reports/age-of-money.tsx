import { createFileRoute } from "@tanstack/react-router";
import { ReportPage } from "@/components/reports/report-page";
import { reportSearchSchema } from "@/lib/reports";

export const Route = createFileRoute("/_authed/budgets/$budgetId/reports/age-of-money")({
  validateSearch: reportSearchSchema,
  component: Report,
});

/** YNAB's Age of Money report (EVERYCENT-81). */
function Report() {
  return (
    <ReportPage title="Age of Money">
      <p className="text-muted-foreground text-sm">Coming soon.</p>
    </ReportPage>
  );
}
