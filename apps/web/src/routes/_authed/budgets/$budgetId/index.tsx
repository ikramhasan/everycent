import { zero } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@everycent/ui/components/card";
import { Skeleton } from "@everycent/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AddAccountDialog } from "@/components/add-account-dialog";
import { CategoryList } from "@/components/category-list";
import { accountsQueryOptions } from "@/lib/accounts";
import { useBudget } from "@/lib/budget-context";
import { categoriesQueryOptions } from "@/lib/categories";
import { useCategoryActions } from "@/lib/use-category-actions";

export const Route = createFileRoute("/_authed/budgets/$budgetId/")({
  component: BudgetPage,
});

function BudgetPage() {
  const { budget, formatAmount, formatDate } = useBudget();
  const categories = useQuery(categoriesQueryOptions(budget.id));
  const actions = useCategoryActions(budget.id);
  const accounts = useQuery(accountsQueryOptions(budget.id));
  const [addingAccount, setAddingAccount] = useState(false);

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
      {budget.archivedAt && (
        <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          This budget was archived by a fresh start on {formatDate(budget.archivedAt.slice(0, 10))}.
          Its history is kept here; new budgeting happens in the budget that replaced it.
        </p>
      )}
      {accounts.data && accounts.data.accounts.length === 0 && !budget.archivedAt && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3">
          <div className="grid gap-0.5">
            <p className="font-medium text-sm">Add your first account</p>
            <p className="text-muted-foreground text-sm">
              Its balance today becomes money you can give a job.
            </p>
          </div>
          <Button size="sm" onClick={() => setAddingAccount(true)}>
            <Plus /> Add Account
          </Button>
          <AddAccountDialog budget={budget} open={addingAccount} onOpenChange={setAddingAccount} />
        </div>
      )}
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
