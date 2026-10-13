import { Button } from "@everycent/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@everycent/ui/components/empty";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, Outlet } from "@tanstack/react-router";
import { ManagePayeesProvider } from "@/components/manage-payees";
import { BudgetProvider } from "@/lib/budget-context";
import { apiErrorCode, budgetQueryOptions } from "@/lib/budgets";
import { UndoProvider } from "@/lib/undo";

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
      <UndoProvider>
        <ManagePayeesProvider>
          <Outlet />
        </ManagePayeesProvider>
      </UndoProvider>
    </BudgetProvider>
  );
}

function BudgetNotFound() {
  return (
    <Empty className="py-12">
      <EmptyHeader>
        <EmptyTitle>Budget not found</EmptyTitle>
        <EmptyDescription>It may have been deleted, or it isn't shared with you.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link to="/budgets">View all budgets</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
