import { zero } from "@everycent/engine";
import { Card, CardDescription, CardHeader, CardTitle } from "@everycent/ui/components/card";
import { Skeleton } from "@everycent/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CategoryList } from "@/components/category-list";
import { useBudget } from "@/lib/budget-context";
import { categoriesQueryOptions } from "@/lib/categories";
import { useCategoryActions } from "@/lib/use-category-actions";

export const Route = createFileRoute("/_authed/budgets/$budgetId/")({
  component: BudgetPage,
});

function BudgetPage() {
  const { budget, formatAmount } = useBudget();
  const categories = useQuery(categoriesQueryOptions(budget.id));
  const actions = useCategoryActions(budget.id);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="truncate font-semibold text-2xl tracking-tight">{budget.name}</h1>
        <Card className="min-w-48 py-3">
          <CardHeader className="px-4">
            <CardDescription>Ready to Assign</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatAmount(zero(budget.currency))}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      {categories.isPending ? (
        <Skeleton className="h-64" />
      ) : categories.isError ? (
        <p className="text-muted-foreground">Couldn't load categories.</p>
      ) : (
        <CategoryList data={categories.data} actions={actions} />
      )}
    </div>
  );
}
