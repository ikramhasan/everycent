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
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { BudgetForm, type BudgetFormValues } from "@/components/budget-form";
import { BudgetMembers } from "@/components/budget-members";
import { ExchangeRates } from "@/components/exchange-rates";
import { FreshStartDialog } from "@/components/fresh-start-dialog";
import { useManagePayees } from "@/components/manage-payees";
import { PageHeader } from "@/components/page-header";
import { PageTitle } from "@/components/page-title";
import { $api } from "@/lib/api";
import { useBudget } from "@/lib/budget-context";
import { apiErrorMessage, budgetQueryOptions, invalidateBudgets } from "@/lib/budgets";
import { todayIso } from "@/lib/dates";
import { downloadBackup } from "@/lib/exports";

export const Route = createFileRoute("/_authed/budgets/$budgetId/settings")({
  component: BudgetSettingsPage,
});

function BudgetSettingsPage() {
  const { budget, readOnly } = useBudget();
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
    // The page edge matches the other pages; the settings keep a readable column.
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,42rem)] content-start gap-6">
      <PageTitle name="Budget settings" />
      <PageHeader title="Budget settings" />
      {/* A viewer (EVERYCENT-88) sees the settings but can't change them. */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>The budget's name, and how it shows amounts and dates.</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={readOnly} className="contents">
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
          </fieldset>
        </CardContent>
      </Card>

      <BudgetMembers />

      <Card hidden={readOnly}>
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

      <fieldset disabled={readOnly} className="contents">
        <ExchangeRates budget={budget} />
      </fieldset>

      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
          <CardDescription>
            Download this whole budget as a file: accounts, categories, transactions, targets,
            scheduled transactions and settings. Restore it from All budgets as a new budget.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() =>
              downloadBackup(budget).catch(() => toast.error("Couldn't download the backup."))
            }
          >
            <FileDown /> Download backup
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
        // Card draws its edge with a ring, so the warning colour goes on the ring.
        <Card className="ring-destructive/40">
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
