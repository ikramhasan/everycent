import { createFileRoute } from "@tanstack/react-router";
import { ReportPage } from "@/components/reports/report-page";
import { reportSearchSchema } from "@/lib/reports";

export const Route = createFileRoute("/_authed/budgets/$budgetId/reports/income-expense")({
  validateSearch: reportSearchSchema,
  component: Report,
});

/** YNAB's Income v Expense report (EVERYCENT-80). */
function Report() {
  return (
    <ReportPage title="Income v Expense">
      <p className="text-muted-foreground text-sm">Coming soon.</p>
    </ReportPage>
  );
}
