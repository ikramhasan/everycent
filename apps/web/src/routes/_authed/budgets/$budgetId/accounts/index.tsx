import { createFileRoute } from "@tanstack/react-router";
import { Register } from "@/components/register";

export const Route = createFileRoute("/_authed/budgets/$budgetId/accounts/")({
  component: AllAccountsPage,
});

/** YNAB's "All Accounts": every account's transactions in one register. */
function AllAccountsPage() {
  return (
    <div className="grid gap-6">
      <h1 className="font-semibold text-2xl tracking-tight">All Accounts</h1>
      <Register />
    </div>
  );
}
