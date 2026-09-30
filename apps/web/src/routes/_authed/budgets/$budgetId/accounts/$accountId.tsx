import { ACCOUNT_TYPE_LABELS, isOnBudget, money } from "@everycent/engine";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@everycent/ui/components/alert-dialog";
import { Badge } from "@everycent/ui/components/badge";
import { Button } from "@everycent/ui/components/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@everycent/ui/components/dialog";
import { Skeleton } from "@everycent/ui/components/skeleton";
import { cn } from "@everycent/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CircleCheck, Lock, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type AccountEdit, EditAccountForm } from "@/components/account-forms";
import { accountsQueryOptions, accountTransactionsQueryOptions } from "@/lib/accounts";
import { $api } from "@/lib/api";
import { useBudget } from "@/lib/budget-context";
import { apiErrorCode, apiErrorMessage } from "@/lib/budgets";
import { categoriesQueryOptions } from "@/lib/categories";
import { todayIso } from "@/lib/dates";

export const Route = createFileRoute("/_authed/budgets/$budgetId/accounts/$accountId")({
  component: AccountPage,
});

type Confirm = "close" | "delete" | null;

function AccountPage() {
  const { accountId } = Route.useParams();
  const { budget, formatAmount, formatDate } = useBudget();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const accounts = useQuery(accountsQueryOptions(budget.id));
  const transactions = useQuery(accountTransactionsQueryOptions(budget.id, accountId));
  const update = $api.useMutation("patch", "/v1/budgets/{budgetId}/accounts/{accountId}");
  const close = $api.useMutation("post", "/v1/budgets/{budgetId}/accounts/{accountId}/close");
  const reopen = $api.useMutation("post", "/v1/budgets/{budgetId}/accounts/{accountId}/reopen");
  const remove = $api.useMutation("delete", "/v1/budgets/{budgetId}/accounts/{accountId}");
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const account = accounts.data?.accounts.find((a) => a.id === accountId);
  const path = { budgetId: budget.id, accountId };
  const show = (amount: string) => formatAmount(money(BigInt(amount), budget.currency));

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountsQueryOptions(budget.id).queryKey }),
      queryClient.invalidateQueries({
        queryKey: accountTransactionsQueryOptions(budget.id, accountId).queryKey,
      }),
      queryClient.invalidateQueries({ queryKey: categoriesQueryOptions(budget.id).queryKey }),
    ]);
  }

  async function handleSave(values: AccountEdit) {
    try {
      await update.mutateAsync({ params: { path }, body: values });
      await refresh();
      setEditing(false);
      return null;
    } catch (error) {
      return apiErrorMessage(error, "Couldn't save the account.");
    }
  }

  async function run(work: () => Promise<unknown>, done: string, failure: string) {
    try {
      await work();
      await refresh();
      toast.success(done);
    } catch (error) {
      toast.error(apiErrorMessage(error, failure));
    }
  }

  async function handleDelete() {
    try {
      await remove.mutateAsync({ params: { path } });
    } catch (error) {
      toast.error(
        apiErrorCode(error) === "ACCOUNT_HAS_HISTORY"
          ? "This account has transactions, so it can't be deleted. Close it instead."
          : apiErrorMessage(error, "Couldn't delete the account."),
      );
      return;
    }
    await navigate({ to: "/budgets/$budgetId", params: { budgetId: budget.id } });
    await refresh();
    toast.success(`Deleted “${account?.name}”`);
  }

  if (accounts.isPending) return <Skeleton className="mx-auto h-40 max-w-4xl" />;
  if (!account) {
    return <p className="text-center text-muted-foreground">This account doesn't exist.</p>;
  }

  const working = BigInt(account.balances.working);

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-semibold text-2xl tracking-tight">{account.name}</h1>
            {account.closed && <Badge variant="secondary">Closed</Badge>}
          </div>
          <p className="text-muted-foreground text-sm">
            {ACCOUNT_TYPE_LABELS[account.type]}
            {isOnBudget(account.type) ? "" : " · off budget"}
          </p>
          {account.note && <p className="max-w-prose text-sm">{account.note}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil /> Edit account
        </Button>
      </div>

      <dl className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-lg border px-4 py-3 tabular-nums">
        <Balance label="Cleared Balance" value={show(account.balances.cleared)} />
        <span className="pb-0.5 text-muted-foreground">+</span>
        <Balance label="Uncleared Balance" value={show(account.balances.uncleared)} />
        <span className="pb-0.5 text-muted-foreground">=</span>
        <Balance
          label="Working Balance"
          value={show(account.balances.working)}
          negative={working < 0n}
          strong
        />
      </dl>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Payee</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Memo</th>
              <th className="px-3 py-2 text-right font-medium">Outflow</th>
              <th className="px-3 py-2 text-right font-medium">Inflow</th>
              <th className="px-3 py-2">
                <span className="sr-only">Cleared</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {transactions.data?.transactions.map((t) => {
              const amount = BigInt(t.amount);
              const magnitude = (amount < 0n ? -amount : amount).toString();
              return (
                <tr key={t.id}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDate(t.date)}</td>
                  <td className="px-3 py-2">{t.payeeName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.categoryName ?? ""}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.memo}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {amount < 0n ? show(magnitude) : ""}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {amount > 0n ? show(magnitude) : ""}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t.cleared === "reconciled" ? (
                      <Lock className="size-4" aria-label="Reconciled" />
                    ) : t.cleared === "cleared" ? (
                      <CircleCheck className="size-4 text-primary" aria-label="Cleared" />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t px-3 py-2 text-muted-foreground text-xs">
          Adding and editing transactions comes with the register.
        </p>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit account</DialogTitle>
          </DialogHeader>
          <EditAccountForm
            key={`${account.id}-${editing}`}
            settings={budget}
            initial={account}
            onSubmit={handleSave}
          />
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {account.closed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  run(
                    () => reopen.mutateAsync({ params: { path } }),
                    "Account reopened",
                    "Couldn't reopen the account.",
                  )
                }
              >
                Reopen account
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirm("close")}>
                Close account
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => setConfirm("delete")}
            >
              Delete account
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "close" ? `Close “${account.name}”?` : `Delete “${account.name}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "Only accounts with no transactions besides their starting balance can be deleted. This can't be undone."
                : working === 0n
                  ? "It moves to Closed Accounts, where you can still see its history or reopen it."
                  : `Its balance of ${show(account.balances.working)} will be zeroed out with a Manual Balance Adjustment${
                      isOnBudget(account.type) ? ", which comes out of Ready to Assign" : ""
                    }. To keep the money, transfer it to another account first.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "delete" ? "destructive" : "default"}
              onClick={async () => {
                const action = confirm;
                setConfirm(null);
                setEditing(false);
                if (action === "delete") return handleDelete();
                await run(
                  () => close.mutateAsync({ params: { path }, body: { date: todayIso() } }),
                  "Account closed",
                  "Couldn't close the account.",
                );
              }}
            >
              {confirm === "delete" ? "Delete account" : "Close account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Balance({
  label,
  value,
  negative = false,
  strong = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="grid">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          strong ? "font-semibold text-lg" : "text-base",
          negative && "text-destructive",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
