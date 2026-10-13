import { createFileRoute, redirect } from "@tanstack/react-router";
import { budgetsQueryOptions, pickBudgetRedirect } from "@/lib/budgets";
import { pendingInvitation } from "@/lib/pending-invitation";

/**
 * "/" opens an invitation opened before signing in, else the last-used budget (like YNAB), else
 * the first one, else the create form.
 */
export const Route = createFileRoute("/_authed/")({
  beforeLoad: async ({ context }) => {
    if (pendingInvitation()) throw redirect({ to: "/invitation", replace: true });
    const list = await context.queryClient.fetchQuery({ ...budgetsQueryOptions(), staleTime: 0 });
    const budgetId = pickBudgetRedirect(list);
    if (budgetId) throw redirect({ to: "/budgets/$budgetId", params: { budgetId }, replace: true });
    throw redirect({ to: "/budgets/new", replace: true });
  },
});
