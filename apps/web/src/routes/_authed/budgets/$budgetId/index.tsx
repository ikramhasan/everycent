import { type BudgetMonth, isBudgetMonth } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { Skeleton } from "@everycent/ui/components/skeleton";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AddAccountDialog } from "@/components/add-account-dialog";
import { type CategoryFigures, CategoryList } from "@/components/category-list";
import { MonthNav } from "@/components/month-nav";
import { FutureMonthsPanel, ReadyToAssignBanner } from "@/components/ready-to-assign";
import { accountsQueryOptions } from "@/lib/accounts";
import { $api } from "@/lib/api";
import { useBudget } from "@/lib/budget-context";
import { apiErrorMessage } from "@/lib/budgets";
import { categoriesQueryOptions } from "@/lib/categories";
import { todayIso } from "@/lib/dates";
import { parseMoneyInput, toMoneyInput } from "@/lib/money-input";
import {
  currentMonth,
  invalidateMonths,
  monthQueryOptions,
  toMoney,
  useCollapsedGroups,
} from "@/lib/months";
import { useCategoryActions } from "@/lib/use-category-actions";

export const Route = createFileRoute("/_authed/budgets/$budgetId/")({
  // The month on screen, YYYY-MM; the current month when absent.
  validateSearch: z.object({
    month: z.string().refine(isBudgetMonth).optional().catch(undefined),
  }),
  component: BudgetPage,
});

function BudgetPage() {
  const { budget, formatAmount, formatDate } = useBudget();
  const navigate = Route.useNavigate();
  const today = currentMonth();
  const month: BudgetMonth = Route.useSearch().month ?? today;
  const categories = useQuery(categoriesQueryOptions(budget.id));
  const figures = useQuery({
    ...monthQueryOptions(budget.id, month),
    placeholderData: keepPreviousData,
  });
  const actions = useCategoryActions(budget.id);
  const accounts = useQuery(accountsQueryOptions(budget.id));
  const [addingAccount, setAddingAccount] = useState(false);
  const { collapsed, setCollapsed } = useCollapsedGroups(budget.id);
  const queryClient = useQueryClient();
  const assignMutation = $api.useMutation(
    "put",
    "/v1/budgets/{budgetId}/months/{month}/categories/{categoryId}",
  );

  const goTo = (m: BudgetMonth) =>
    navigate({ search: { month: m === today ? undefined : m }, replace: false });

  // A month out of the budget's range (a stale link) shows the nearest one instead.
  const range = figures.data && { first: figures.data.firstMonth, last: figures.data.lastMonth };
  useEffect(() => {
    if (!range || figures.isPlaceholderData) return;
    const nearest = month < range.first ? range.first : month > range.last ? range.last : month;
    if (nearest !== month) {
      void navigate({ search: { month: nearest === today ? undefined : nearest }, replace: true });
    }
  }, [range?.first, range?.last, month, today, navigate, figures.isPlaceholderData]);

  const listFigures = useMemo<CategoryFigures | undefined>(() => {
    const data = figures.data;
    if (!data) return undefined;
    const settings = { ...budget, currency: data.currency };
    return {
      month: data,
      format: (amount) => formatAmount(toMoney(amount, data.currency)),
      assign: {
        parse: (text) => parseMoneyInput(text, settings),
        toInput: (amount) => toMoneyInput(amount, settings),
        assign: async (categoryId, amount) => {
          try {
            const updated = await assignMutation.mutateAsync({
              params: { path: { budgetId: budget.id, month: data.month, categoryId } },
              body: { assigned: amount.toString(), today: todayIso() },
            });
            queryClient.setQueryData(monthQueryOptions(budget.id, data.month).queryKey, updated);
          } catch (error) {
            toast.error(apiErrorMessage(error, "Couldn't assign the money."));
          } finally {
            // Every other month's Ready to Assign and Available depend on it.
            void invalidateMonths(queryClient);
          }
        },
      },
    };
    // mutateAsync is stable; the mutation object itself changes every render.
  }, [figures.data, formatAmount, budget, queryClient]);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="truncate font-semibold text-muted-foreground text-sm">{budget.name}</h1>
          <MonthNav
            month={month}
            current={today}
            first={range?.first ?? month}
            last={range?.last ?? month}
            onChange={goTo}
          />
        </div>
        {listFigures && (
          <ReadyToAssignBanner
            month={month}
            current={today}
            amount={listFigures.month.readyToAssign}
            format={listFigures.format}
          />
        )}
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
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {categories.isPending ? (
          <Skeleton className="h-64" />
        ) : categories.isError ? (
          <p className="text-muted-foreground">Couldn't load categories.</p>
        ) : (
          <CategoryList
            data={categories.data}
            actions={actions}
            figures={listFigures}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
          />
        )}
        {listFigures && month === today && (
          <FutureMonthsPanel data={listFigures.month} format={listFigures.format} />
        )}
      </div>
    </div>
  );
}
