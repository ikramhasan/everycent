import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { Register } from "@/components/register";
import { REVIEW_SEARCH, ReviewBanner } from "@/components/review-banner";
import { accountsQueryOptions } from "@/lib/accounts";
import { useBudget } from "@/lib/budget-context";
import { type RegisterSearch, registerSearchSchema } from "@/lib/register-filters";

export const Route = createFileRoute("/_authed/budgets/$budgetId/accounts/")({
  validateSearch: registerSearchSchema,
  component: AllAccountsPage,
});

/** YNAB's "All Accounts": every account's transactions in one register. */
function AllAccountsPage() {
  const search = Route.useSearch();
  const { budget } = useBudget();
  const accounts = useQuery(accountsQueryOptions(budget.id));
  const navigate = useNavigate({ from: Route.fullPath });
  const onSearchChange = useCallback(
    (patch: Partial<RegisterSearch>, replace?: boolean) =>
      void navigate({ search: (prev) => ({ ...prev, ...patch }), replace }),
    [navigate],
  );
  const toReview = (accounts.data?.accounts ?? []).reduce((sum, a) => sum + a.toReview, 0);
  return (
    <div className="grid gap-6">
      <ReviewBanner count={toReview} onView={() => onSearchChange({ q: REVIEW_SEARCH })} />
      <h1 className="font-semibold text-2xl tracking-tight">All Accounts</h1>
      <Register search={search} onSearchChange={onSearchChange} />
    </div>
  );
}
