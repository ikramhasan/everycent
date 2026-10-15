import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@everycent/ui/components/alert-dialog";
import { Button } from "@everycent/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@everycent/ui/components/card";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { BudgetForm, type BudgetFormValues } from "@/components/budget-form";
import { BudgetMembers } from "@/components/budget-members";
import { FreshStartDialog } from "@/components/fresh-start-dialog";
import { useManagePayees } from "@/components/manage-payees";
import { $api } from "@/lib/api";
import { useBudget } from "@/lib/budget-context";
import { apiErrorMessage, budgetQueryOptions, invalidateBudgets } from "@/lib/budgets";
import { todayIso } from "@/lib/dates";

export const Route = createFileRoute("/_authed/budgets/$budgetId/settings")({
  component: BudgetSettingsPage,
});

function BudgetSettingsPage() {
  const { budget } = useBudget();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const update = $api.useMutation("patch", "/v1/budgets/{budgetId}");
  const remove = $api.useMutation("delete", "/v1/budgets/{budgetId}");
  const freshStart = $api.useMutation("post", "/v1/budgets/{budgetId}/fresh-start");
  const managePayees = useManagePayees();
  const path = { budgetId: budget.id };

  async function handleSave({
    name,
    numberFormat,
    currencySymbolPosition,
    dateFormat,
  }: BudgetFormValues) {
    try {
      await update.mutateAsync({
        params: { path },
        body: { name, numberFormat, currencySymbolPosition, dateFormat },
      });
      await invalidateBudgets(queryClient);
      toast.success("Budget settings saved");
      return null;
    } catch (error) {
      return apiErrorMessage(error, "Couldn't save the budget. Try again.");
    }
  }

  async function handleDelete() {
    try {
      await remove.mutateAsync({ params: { path } });
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't delete the budget. Try again."));
      return;
    }
    // Leave the deleted budget's routes before dropping its cached data.
    await navigate({ to: "/" });
    queryClient.removeQueries({ queryKey: budgetQueryOptions(budget.id).queryKey });
    await invalidateBudgets(queryClient);
    toast.success(`Deleted “${budget.name}”`);
  }

  async function handleFreshStart(name: string) {
    try {
      const created = await freshStart.mutateAsync({
        params: { path },
        body: { date: todayIso(), name },
      });
      await invalidateBudgets(queryClient);
      await navigate({ to: "/budgets/$budgetId", params: { budgetId: created.id } });
      toast.success("Fresh start made. Your old budget is archived under All budgets.");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't make a fresh start. Try again."));
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <h1 className="font-semibold text-2xl tracking-tight">Budget settings</h1>
      <Card>
        <CardContent>
          <BudgetForm
            // Reset the form to the saved values after each save.
            key={budget.updatedAt}
            currencyLocked
            defaultValues={{
              name: budget.name,
              currency: budget.currency,
              numberFormat: budget.numberFormat,
              currencySymbolPosition: budget.currencySymbolPosition,
              dateFormat: budget.dateFormat,
            }}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            onSubmit={handleSave}
          />
        </CardContent>
      </Card>

      <BudgetMembers />

      <Card>
        <CardHeader>
          <CardTitle>Payees</CardTitle>
          <CardDescription>
            Rename, combine, hide or delete the payees your transactions use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => managePayees?.()}>
            Manage payees
          </Button>
        </CardContent>
      </Card>

      {/* An archived budget can start fresh again, as in YNAB. */}
      {budget.role === "owner" && (
        <Card>
          <CardHeader>
            <CardTitle>Fresh start</CardTitle>
            <CardDescription>
              Start over with the same accounts, categories, payees, scheduled transactions and
              partners, but no transactions. Accounts start with a $0 balance for you to update with
              today's balance. This budget is kept, renamed as archived.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FreshStartDialog onContinue={handleFreshStart} />
          </CardContent>
        </Card>
      )}

      {budget.role === "owner" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Delete budget</CardTitle>
            <CardDescription>
              Permanently deletes this budget and everything in it, for everyone it's shared with.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete budget</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{budget.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes the budget and everything in it, for everyone it's
                    shared with. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={handleDelete}>
                    Delete budget
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
