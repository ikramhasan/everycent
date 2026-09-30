import { Button } from "@everycent/ui/components/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, Outlet } from "@tanstack/react-router";
import { BudgetProvider } from "@/lib/budget-context";
import { apiErrorCode, budgetQueryOptions } from "@/lib/budgets";

export const Route = createFileRoute("/_authed/budgets/$budgetId")({
  loader: async ({ context, params, preload }) => {
    // Fetching a budget records it as the user's last-used one, so hover preloads must not.
    if (preload) return;
    try {
      await context.queryClient.fetchQuery({
        ...budgetQueryOptions(params.budgetId),
        staleTime: 0,
      });
    } catch (error) {
      if (apiErrorCode(error) === "NOT_FOUND") throw notFound();
      throw error;
    }
  },
  component: BudgetLayout,
  notFoundComponent: BudgetNotFound,
});

function BudgetLayout() {
  const { budgetId } = Route.useParams();
  const { data: budget } = useSuspenseQuery(budgetQueryOptions(budgetId));
  return (
    <BudgetProvider budget={budget}>
      <Outlet />
    </BudgetProvider>
  );
}

function BudgetNotFound() {
  return (
    <div className="mx-auto grid max-w-md gap-4 py-12 text-center">
      <h1 className="font-semibold text-xl">Budget not found</h1>
      <p className="text-muted-foreground">
        It may have been deleted, or it isn't shared with you.
      </p>
      <Button asChild variant="outline" className="justify-self-center">
        <Link to="/budgets">View all budgets</Link>
      </Button>
    </div>
  );
}
