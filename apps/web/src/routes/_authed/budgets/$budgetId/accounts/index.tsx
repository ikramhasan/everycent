import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { Register } from "@/components/register";
import { type RegisterSearch, registerSearchSchema } from "@/lib/register-filters";

export const Route = createFileRoute("/_authed/budgets/$budgetId/accounts/")({
  validateSearch: registerSearchSchema,
  component: AllAccountsPage,
});

/** YNAB's "All Accounts": every account's transactions in one register. */
function AllAccountsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onSearchChange = useCallback(
    (patch: Partial<RegisterSearch>, replace?: boolean) =>
      void navigate({ search: (prev) => ({ ...prev, ...patch }), replace }),
    [navigate],
  );
  return (
    <div className="grid gap-6">
      <h1 className="font-semibold text-2xl tracking-tight">All Accounts</h1>
      <Register search={search} onSearchChange={onSearchChange} />
    </div>
  );
}
