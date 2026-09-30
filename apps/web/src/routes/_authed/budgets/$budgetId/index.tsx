import { zero } from "@everycent/engine";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@everycent/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { useBudget } from "@/lib/budget-context";

export const Route = createFileRoute("/_authed/budgets/$budgetId/")({
  component: BudgetPage,
});

function BudgetPage() {
  const { budget, formatAmount } = useBudget();

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <h1 className="truncate font-semibold text-2xl tracking-tight">{budget.name}</h1>
      <Card>
        <CardHeader>
          <CardDescription>Ready to Assign</CardDescription>
          <CardTitle className="text-4xl tabular-nums">
            {formatAmount(zero(budget.currency))}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Every cent needs a job. Accounts and categories are coming next.
        </CardContent>
      </Card>
    </div>
  );
}
