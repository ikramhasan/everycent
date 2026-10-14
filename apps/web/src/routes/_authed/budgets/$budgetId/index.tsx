import { addMonths, type BudgetMonth, isBudgetMonth } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { Skeleton } from "@everycent/ui/components/skeleton";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AddAccountDialog } from "@/components/add-account-dialog";
import { AutoAssignPanel } from "@/components/auto-assign";
import { BudgetFilterBar } from "@/components/budget-filter-bar";
import { type ViewDialog, ViewDialogs, ViewsMenu } from "@/components/budget-views";
import {
  CategoryInspector,
  MonthSummary,
  PaymentAlert,
  PaymentInspector,
} from "@/components/category-inspector";
import { type CategoryFigures, CategoryList } from "@/components/category-list";
import { PairedLoanSection, PairedWith, usePairedLoan } from "@/components/loan-inspector";
import { useLoanPlan } from "@/components/loan-page";
import { MonthNav } from "@/components/month-nav";
import { MonthNote } from "@/components/month-note";
import {
  AssignButton,
  AvailableButton,
  AvailablePill,
  FixThisButton,
} from "@/components/move-money";
import { ProgressBarsToggle } from "@/components/progress-bars-toggle";
import { FutureMonthsPanel, ReadyToAssignBanner } from "@/components/ready-to-assign";
import { RecentMoves } from "@/components/recent-moves";
import { TargetSection } from "@/components/target-inspector";
import { UndoRedoButtons } from "@/components/undo-redo-buttons";
import { UpcomingTransactions } from "@/components/upcoming-transactions";
import { accountsQueryOptions } from "@/lib/accounts";
import { $api } from "@/lib/api";
import { useBudget } from "@/lib/budget-context";
import {
  availableMark,
  breakdown,
  EMPTY_VIEW,
  filteredIds,
  isCaution,
  isPresetFilter,
  overspentCount,
  overspentOnlyCredit,
  summarize,
  UNCATEGORIZED,
  useBudgetFilter,
  useProgressBars,
} from "@/lib/budget-view";
import { MAX_CUSTOM_VIEWS, useViewActions, viewsQueryOptions } from "@/lib/budget-views";
import { apiErrorMessage } from "@/lib/budgets";
import { categoriesQueryOptions } from "@/lib/categories";
import { todayIso } from "@/lib/dates";
import { useFixThisMonths } from "@/lib/fix-this";
import { parseMoneyInput, toMoneyInput } from "@/lib/money-input";
import {
  type BudgetMonthData,
  currentMonth,
  invalidateMonths,
  moneyOptions,
  monthQueryOptions,
  rememberMonth,
  toMoney,
  useCollapsedGroups,
} from "@/lib/months";
import {
  categoriesWithMoves,
  HISTORY_MONTHS_BACK,
  invalidateMoves,
  monthMovesQueryOptions,
} from "@/lib/moves";
import { sessionQueryOptions } from "@/lib/session";
import { type CategoryTarget, useTargetActions } from "@/lib/targets";
import { useUndo } from "@/lib/undo";
import { useCategoryActions } from "@/lib/use-category-actions";

export const Route = createFileRoute("/_authed/budgets/$budgetId/")({
  // The month on screen, YYYY-MM; the current month when absent.
  validateSearch: z.object({
    month: z.string().refine(isBudgetMonth).optional().catch(undefined),
    // A category to select on arrival, its Assigned being edited with `assign` (the payoff
    // simulator's "Copy and go to my plan").
    category: z.string().optional().catch(undefined),
    assign: z.boolean().optional().catch(undefined),
  }),
  component: BudgetPage,
});

function BudgetPage() {
  const { budget, formatAmount, formatDate } = useBudget();
  const navigate = Route.useNavigate();
  const today = currentMonth();
  const search = Route.useSearch();
  const month: BudgetMonth = search.month ?? today;
  useEffect(() => rememberMonth(budget.id, month), [budget.id, month]);
  const categories = useQuery(categoriesQueryOptions(budget.id));
  const figures = useQuery({
    ...monthQueryOptions(budget.id, month),
    placeholderData: keepPreviousData,
  });
  const actions = useCategoryActions(budget.id);
  const history = useUndo();
  const targetActions = useTargetActions(budget.id, history.record);
  const accounts = useQuery(accountsQueryOptions(budget.id));
  const [addingAccount, setAddingAccount] = useState(false);
  const { collapsed, setCollapsed } = useCollapsedGroups(budget.id);
  const { filter, setFilter } = useBudgetFilter(budget.id);
  const views = useQuery(viewsQueryOptions(budget.id));
  const viewActions = useViewActions(budget.id);
  const [viewDialog, setViewDialog] = useState<ViewDialog>(null);
  // The custom view on, if the stored view is one; an unknown id (a deleted view) shows All.
  const customView = isPresetFilter(filter)
    ? undefined
    : views.data?.views.find((v) => v.id === filter);
  const preset = isPresetFilter(filter) ? filter : "all";
  const { progressBars, setProgressBars } = useProgressBars();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [editAssigned, setEditAssigned] = useState<string | undefined>();
  // The category a link or Recent Moves opened, scrolled to once its month is on screen.
  const [scrollTo, setScrollTo] = useState<{ id: string } | undefined>();
  useEffect(() => {
    if (!search.category) return;
    setSelected(new Set([search.category]));
    setEditAssigned(search.assign ? search.category : undefined);
    setScrollTo({ id: search.category });
    void navigate({ search: { month: search.month }, replace: true });
  }, [search.category, search.assign]);
  // YNAB's per-category history covers the current and later months and three months back.
  const monthMoves = useQuery({
    ...monthMovesQueryOptions(budget.id, month),
    enabled: month >= addMonths(today, -HISTORY_MONTHS_BACK),
  });
  const session = useQuery(sessionQueryOptions);
  const queryClient = useQueryClient();
  const assignMutation = $api.useMutation(
    "put",
    "/v1/budgets/{budgetId}/months/{month}/categories/{categoryId}",
  );
  const moveMutation = $api.useMutation("post", "/v1/budgets/{budgetId}/months/{month}/moves");
  const noteMutation = $api.useMutation("put", "/v1/budgets/{budgetId}/months/{month}/note");
  /** Saves `month`'s note; YNAB's Undo covers month notes (checked 2026-10-12). */
  const saveMonthNote = async (m: BudgetMonth, before: string, after: string) => {
    const put = async (note: string) => {
      try {
        await noteMutation.mutateAsync({
          params: { path: { budgetId: budget.id, month: m } },
          body: { note },
        });
      } catch (error) {
        toast.error(apiErrorMessage(error, "Couldn't save the note."));
        throw error;
      } finally {
        await invalidateMonths(queryClient);
      }
    };
    try {
      await put(after);
    } catch {
      return;
    }
    history.record({
      label: "month note",
      undo: () => put(before),
      redo: () => put(after),
    });
  };
  const autoAssignMutation = $api.useMutation(
    "post",
    "/v1/budgets/{budgetId}/months/{month}/auto-assign",
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

  // Categories on the budget screen (not hidden), with their names and notes.
  const listed = useMemo(() => {
    const map = new Map<string, ListedCategory>();
    for (const g of categories.data?.groups ?? []) {
      if (g.hidden) continue;
      for (const c of g.categories) {
        if (!c.hidden) {
          map.set(c.id, { name: c.name, note: c.note, group: g.name, target: c.target });
        }
      }
    }
    return map;
  }, [categories.data]);
  const visible = useMemo(() => new Set(listed.keys()), [listed]);
  const names = useMemo(
    () =>
      new Map(
        (categories.data?.groups ?? []).flatMap((g) => g.categories.map((c) => [c.id, c.name])),
      ),
    [categories.data],
  );
  const shown = useMemo(
    () =>
      // A custom view keeps its categories that aren't hidden (YNAB, 2026-10-14).
      customView
        ? new Set(customView.categoryIds.filter((id) => visible.has(id)))
        : figures.data && preset !== "all"
          ? filteredIds(preset, figures.data, visible)
          : undefined,
    [figures.data, preset, customView, visible],
  );
  // A category that leaves the view (or the list) leaves the selection too.
  const selection = useMemo<ReadonlySet<string>>(
    () =>
      new Set(
        [...selected].filter(
          (id) => (id === UNCATEGORIZED || visible.has(id)) && (!shown || shown.has(id)),
        ),
      ),
    [selected, visible, shown],
  );

  const listFigures = useMemo<CategoryFigures | undefined>(() => {
    const data = figures.data;
    if (!data) return undefined;
    const settings = { ...budget, currency: data.currency };
    const onScreen = data.month;
    const parse = (text: string) => parseMoneyInput(text, settings);
    const toInput = (amount: string) => toMoneyInput(amount, settings);

    /** Saves a change to assigned money and records its local inverse. */
    async function save(
      work: () => Promise<BudgetMonthData>,
      inverse: () => Promise<BudgetMonthData>,
      label: string,
      failure: string,
      replay = work,
    ) {
      try {
        const updated = await work();
        if (updated.month === onScreen) {
          queryClient.setQueryData(monthQueryOptions(budget.id, onScreen).queryKey, updated);
        }
        history.record({
          label,
          undo: () => saveHistory(inverse),
          redo: () => saveHistory(replay),
        });
      } catch (error) {
        toast.error(apiErrorMessage(error, failure));
      } finally {
        await refreshBudget();
      }
    }

    async function saveHistory(work: () => Promise<BudgetMonthData>) {
      const updated = await work();
      if (updated.month === onScreen) {
        queryClient.setQueryData(monthQueryOptions(budget.id, onScreen).queryKey, updated);
      }
      await refreshBudget();
    }

    async function refreshBudget() {
      await Promise.all([invalidateMonths(queryClient), invalidateMoves(queryClient)]);
    }

    return {
      month: data,
      currentMonth: today,
      format: (amount) => formatAmount(toMoney(amount, data.currency)),
      activity: { budgetId: budget.id, formatDate },
      shown,
      progressBars,
      editAssigned,
      onEditAssignedStarted: () => setEditAssigned(undefined),
      scrollTo,
      moves: monthMoves.data && {
        moves: monthMoves.data.moves,
        withMoves: categoriesWithMoves(monthMoves.data.moves),
        name: (id, deleted) =>
          deleted ??
          (id ? (listed.get(id)?.name ?? names.get(id) ?? "Deleted category") : "Ready to Assign"),
        formatDate,
        currentUserId: session.data?.user.id,
      },
      emptyView: customView
        ? {
            message: `There are no categories selected for ${customView.name}.`,
            onViewAll: () => setFilter("all"),
            onEdit: () => setViewDialog({ kind: "edit", view: customView }),
          }
        : {
            message: preset === "all" ? "" : EMPTY_VIEW[preset],
            onViewAll: () => setFilter("all"),
          },
      selection: {
        selected: selection,
        toggle: (id) => {
          const next = new Set(selection);
          if (!next.delete(id)) next.add(id);
          setSelected(next);
        },
        selectOnly: (id) => setSelected(new Set([id])),
        setAll: (ids) => setSelected(new Set(ids)),
      },
      assign: {
        parse,
        toInput,
        assign: (categoryId, amount) => {
          const before = data.categories.find((c) => c.categoryId === categoryId)?.assigned ?? "0";
          const delta = amount - BigInt(before);
          const readyToAssignId = categories.data?.readyToAssignCategoryId;
          const assign = () =>
            assignMutation.mutateAsync({
              params: { path: { budgetId: budget.id, month: data.month, categoryId } },
              body: { assigned: amount.toString(), today: todayIso() },
            });
          const moveDelta = (reverse: boolean) => {
            if (!readyToAssignId || delta === 0n) return assign();
            const positive = delta > 0n !== reverse;
            return moveMutation.mutateAsync({
              params: { path: { budgetId: budget.id, month: data.month } },
              body: {
                fromCategoryId: positive ? readyToAssignId : categoryId,
                toCategoryId: positive ? categoryId : readyToAssignId,
                amount: (delta > 0n ? delta : -delta).toString(),
                today: todayIso(),
              },
            });
          };
          return save(
            assign,
            () => moveDelta(true),
            "assigned amount",
            "Couldn't assign the money.",
            () => moveDelta(false),
          );
        },
      },
      move: categories.data && {
        options: moneyOptions(categories.data, data),
        readyToAssignId: categories.data.readyToAssignCategoryId,
        parse,
        toInput,
        move: (fromCategoryId, toCategoryId, amount) =>
          moveIn(data.month, fromCategoryId, toCategoryId, amount),
        moveIn,
        moveFrom: (fromMonth, fromCategoryId, toCategoryId, amount) => {
          // To the month on screen from `fromMonth`; undone the other way round.
          const mutate = (to: BudgetMonth, from: BudgetMonth, fromId: string, toId: string) =>
            moveMutation.mutateAsync({
              params: { path: { budgetId: budget.id, month: to } },
              body: {
                fromCategoryId: fromId,
                toCategoryId: toId,
                amount: amount.toString(),
                fromMonth: from,
                today: todayIso(),
              },
            });
          return save(
            () => mutate(data.month, fromMonth, fromCategoryId, toCategoryId),
            () => mutate(fromMonth, data.month, toCategoryId, fromCategoryId),
            "money move",
            "Couldn't move the money.",
          );
        },
      },
    };

    function moveIn(m: BudgetMonth, fromCategoryId: string, toCategoryId: string, amount: bigint) {
      const mutate = (from: string, to: string) =>
        moveMutation.mutateAsync({
          params: { path: { budgetId: budget.id, month: m } },
          body: {
            fromCategoryId: from,
            toCategoryId: to,
            amount: amount.toString(),
            today: todayIso(),
          },
        });
      return save(
        () => mutate(fromCategoryId, toCategoryId),
        () => mutate(toCategoryId, fromCategoryId),
        "money move",
        "Couldn't move the money.",
      );
    }
    // mutateAsync is stable; the mutation objects themselves change every render.
  }, [
    figures.data,
    categories.data,
    formatAmount,
    formatDate,
    budget,
    queryClient,
    shown,
    preset,
    customView,
    setFilter,
    selection,
    history,
    today,
    progressBars,
    editAssigned,
    scrollTo,
    monthMoves.data,
    session.data,
    listed,
    names,
  ]);

  // "Cover overspending from" offers the months Fix This does (YNAB, 2026-10-14).
  const coverMonths = useFixThisMonths({
    budgetId: budget.id,
    month,
    current: today,
    data: figures.data,
    categories: categories.data,
    // Only fetched when something is overspent: covering is the only use.
    always: Boolean(figures.data?.categories.some((c) => c.available.startsWith("-"))),
    unassign: async (m, categoryId, amount) => {
      const move = listFigures?.move;
      if (move) await move.moveIn(m, categoryId, move.readyToAssignId, amount);
    },
  });
  const coverFigures = useMemo(
    () =>
      listFigures?.move && coverMonths
        ? { ...listFigures, move: { ...listFigures.move, coverMonths } }
        : listFigures,
    [listFigures, coverMonths],
  );

  const fixThisMonths = useFixThisMonths({
    budgetId: budget.id,
    month,
    current: today,
    data: figures.data,
    categories: categories.data,
    unassign: async (m, categoryId, amount) => {
      const move = listFigures?.move;
      if (move) await move.moveIn(m, categoryId, move.readyToAssignId, amount);
    },
  });

  /**
   * The Auto-Assign options for `selection` (the inspector's), or for the rows in view with an
   * empty one (the Ready to Assign banner's Assign pop-up, YNAB's "Auto" tab).
   */
  const autoAssignPanel = (selection: ReadonlySet<string>, bare = false) =>
    listFigures && (
      <AutoAssignPanel
        bare={bare}
        // The selected categories, or the rows in view (hidden categories never are).
        categories={listFigures.month.categories.filter((c) =>
          selection.size > 0 ? selection.has(c.categoryId) : (shown ?? visible).has(c.categoryId),
        )}
        onViewAll={() => setFilter("all")}
        names={listed}
        selection={selection.size > 0}
        readyToAssign={BigInt(listFigures.month.readyToAssign)}
        format={listFigures.format}
        onApply={async (option) => {
          // Selected, or the rows in view; the server takes no list as every visible one.
          const categoryIds =
            selection.size > 0
              ? [...selection].filter((id) => id !== UNCATEGORIZED)
              : shown
                ? [...shown].filter((id) => id !== UNCATEGORIZED)
                : [];
          if ((selection.size > 0 || shown) && categoryIds.length === 0) return;
          const before = Object.fromEntries(
            listFigures.month.categories
              .filter((category) =>
                categoryIds.length ? categoryIds.includes(category.categoryId) : true,
              )
              .map((category) => [category.categoryId, category.assigned]),
          );
          const apply = () =>
            autoAssignMutation.mutateAsync({
              params: { path: { budgetId: budget.id, month } },
              body: {
                option,
                ...(categoryIds.length ? { categoryIds } : {}),
                // A view's rows share Ready to Assign, as the whole plan does.
                ...(selection.size === 0 && shown ? { scope: "view" as const } : {}),
                today: todayIso(),
              },
            });
          const readyToAssignId = listFigures.move?.readyToAssignId;
          if (!readyToAssignId) return;
          let deltas: Record<string, bigint> = {};
          const moveDeltas = async (reverse: boolean) => {
            let updated = listFigures.month;
            for (const [categoryId, delta] of Object.entries(deltas)) {
              if (delta === 0n) continue;
              const positive = delta > 0n !== reverse;
              updated = await moveMutation.mutateAsync({
                params: { path: { budgetId: budget.id, month } },
                body: {
                  fromCategoryId: positive ? readyToAssignId : categoryId,
                  toCategoryId: positive ? categoryId : readyToAssignId,
                  amount: (delta > 0n ? delta : -delta).toString(),
                  today: todayIso(),
                },
              });
            }
            return updated;
          };
          const refresh = async () => {
            await Promise.all([invalidateMonths(queryClient), invalidateMoves(queryClient)]);
          };
          try {
            const updated = await apply();
            deltas = Object.fromEntries(
              updated.categories
                .filter((category) => category.categoryId in before)
                .map((category) => [
                  category.categoryId,
                  BigInt(category.assigned) - BigInt(before[category.categoryId] ?? "0"),
                ]),
            );
            queryClient.setQueryData(monthQueryOptions(budget.id, month).queryKey, updated);
            history.record({
              label: "auto-assign",
              undo: async () => {
                queryClient.setQueryData(
                  monthQueryOptions(budget.id, month).queryKey,
                  await moveDeltas(true),
                );
                await refresh();
              },
              redo: async () => {
                queryClient.setQueryData(
                  monthQueryOptions(budget.id, month).queryKey,
                  await moveDeltas(false),
                );
                await refresh();
              },
            });
          } catch (error) {
            toast.error(apiErrorMessage(error, "Couldn't assign the money."));
          } finally {
            void refresh();
          }
        }}
      />
    );

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
          {figures.data && (
            <MonthNote
              key={month}
              note={figures.data.note}
              onSave={(note) => saveMonthNote(month, figures.data?.note ?? "", note)}
            />
          )}
        </div>
        {listFigures && (
          <ReadyToAssignBanner
            amount={listFigures.month.readyToAssign}
            overdraft={listFigures.month.overdraft}
            format={listFigures.format}
            breakdown={{
              lines: listFigures.month.readyToAssignBreakdown,
              month: listFigures.month.month,
            }}
            assign={
              listFigures.move && (
                <AssignButton
                  readyToAssign={listFigures.month.readyToAssign}
                  format={listFigures.format}
                  actions={listFigures.move}
                  auto={autoAssignPanel(new Set(), true)}
                />
              )
            }
            action={
              // An overdraft's "Next Steps" (a YNAB help page) isn't built.
              listFigures.move && (
                <FixThisButton
                  readyToAssign={listFigures.month.readyToAssign}
                  format={listFigures.format}
                  actions={listFigures.move}
                  months={fixThisMonths}
                />
              )
            }
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
          <div className="grid gap-3">
            {listFigures && (
              <BudgetFilterBar
                filter={customView ? filter : preset}
                overspent={overspentCount(listFigures.month, visible)}
                onlyCredit={overspentOnlyCredit(listFigures.month, visible)}
                onChange={setFilter}
                order={views.data?.order}
                custom={views.data?.views}
                menu={
                  views.data && (
                    <ViewsMenu
                      full={views.data.views.length >= MAX_CUSTOM_VIEWS}
                      onManage={() => setViewDialog({ kind: "manage" })}
                      onNew={() =>
                        setViewDialog({
                          kind: "edit",
                          view: null,
                          // Categories selected on the budget start checked (YNAB, 2026-10-14).
                          preselected: [...selection].filter((id) => id !== UNCATEGORIZED),
                        })
                      }
                    />
                  )
                }
              />
            )}
            {views.data && (
              <ViewDialogs
                dialog={viewDialog}
                onDialogChange={setViewDialog}
                order={views.data.order}
                views={views.data.views}
                categories={categories.data}
                actions={viewActions}
                onCreated={(view) => {
                  // YNAB switches to a new view and clears the selection.
                  setFilter(view.id);
                  setSelected(new Set());
                }}
                onDeleted={(viewId) => {
                  if (filter === viewId) setFilter("all");
                }}
              />
            )}
            <CategoryList
              data={categories.data}
              actions={actions}
              figures={coverFigures}
              collapsed={collapsed}
              onCollapsedChange={setCollapsed}
              addGroupDisabled={Boolean(customView)}
              toolbar={
                <div className="flex flex-1 items-center gap-1">
                  <UndoRedoButtons />
                  {listFigures && (
                    <RecentMoves
                      budgetId={budget.id}
                      categories={categories.data}
                      format={listFigures.format}
                      formatDate={formatDate}
                      onOpenCategory={(categoryId, m) =>
                        void navigate({
                          search: { month: m === today ? undefined : m, category: categoryId },
                        })
                      }
                    />
                  )}
                  {customView && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewDialog({ kind: "edit", view: customView })}
                    >
                      <Pencil /> Edit View
                    </Button>
                  )}
                  <ProgressBarsToggle
                    on={progressBars}
                    onChange={setProgressBars}
                    className="ml-auto"
                  />
                </div>
              }
            />
          </div>
        )}
        {listFigures && (
          <aside className="grid grid-cols-[minmax(0,1fr)] gap-4" aria-label="Inspector">
            <Inspector
              figures={listFigures}
              selection={selection}
              shown={shown}
              listed={listed}
              onNoteChange={(categoryId, note) => actions.updateCategory(categoryId, { note })}
              targetActions={targetActions}
              onShowOverspent={() => setFilter("overspent")}
            />
            {/* Uncategorized alone has no Auto-Assign: money can't be assigned to it. */}
            {!(selection.size === 1 && selection.has(UNCATEGORIZED)) && autoAssignPanel(selection)}
            {month === today && (
              <FutureMonthsPanel data={listFigures.month} format={listFigures.format} />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/** A payment category's details from the API, as bigints. */
const paymentFigures = (p: NonNullable<BudgetMonthData["categories"][number]["payment"]>) =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, BigInt(v)])) as Record<
    keyof typeof p,
    bigint
  >;

interface ListedCategory {
  name: string;
  note: string;
  group: string;
  target: CategoryTarget | null;
}

/**
 * YNAB's inspector: one selected category's breakdown, target and note, or the month's summary over the
 * selection (two or more) or over the rows in view (nothing selected).
 */
function Inspector({
  figures,
  selection,
  shown,
  listed,
  onNoteChange,
  targetActions,
  onShowOverspent,
}: {
  figures: CategoryFigures;
  selection: ReadonlySet<string>;
  shown: ReadonlySet<string> | undefined;
  listed: ReadonlyMap<string, ListedCategory>;
  onNoteChange: (categoryId: string, note: string) => Promise<void>;
  targetActions: ReturnType<typeof useTargetActions>;
  onShowOverspent: () => void;
}) {
  const { budget, formatDate } = useBudget();
  const navigate = useNavigate();
  const history = useUndo();
  const { month, format, assign } = figures;
  const only = selection.size === 1 ? [...selection][0] : undefined;
  const pairedLoan = usePairedLoan(only);
  const loanPlan = useLoanPlan(pairedLoan);
  if (only === UNCATEGORIZED && month.uncategorized) {
    return (
      <CategoryInspector
        name="Uncategorized Transactions"
        uncategorized
        totals={breakdown({ assigned: "0", ...month.uncategorized })}
        format={format}
        available={<AvailablePill amount={month.uncategorized.available} format={format} />}
        note=""
        onNoteChange={async () => {}}
      />
    );
  }
  const category = only ? listed.get(only) : undefined;
  const totals = only ? month.categories.find((c) => c.categoryId === only) : undefined;
  if (only && category && totals) {
    const caution = isCaution(totals, month.month, figures.currentMonth);
    const available = figures.move ? (
      <AvailableButton
        categoryId={only}
        categoryName={category.name}
        amount={totals.available}
        format={format}
        actions={figures.move}
        caution={caution}
        target={availableMark(totals)}
      />
    ) : (
      <AvailablePill
        amount={totals.available}
        format={format}
        caution={caution}
        target={availableMark(totals)}
      />
    );
    const upcoming = totals.upcoming && (
      <UpcomingTransactions
        name={category.name}
        available={BigInt(totals.available)}
        upcoming={totals.upcoming}
        format={format}
        formatDate={formatDate}
        onOpen={(accountId, scheduleId) =>
          void navigate({
            to: "/budgets/$budgetId/accounts/$accountId",
            params: { budgetId: budget.id, accountId },
            search: { transaction: scheduleId },
          })
        }
      />
    );
    if (totals.payment) {
      const payment = paymentFigures(totals.payment);
      const alertProps = {
        name: category.name,
        totals: breakdown(totals),
        payment,
        format,
        warn: month.month >= figures.currentMonth,
        onCoverOverspent: onShowOverspent,
      };
      const past = month.month < figures.currentMonth;
      return (
        <PaymentInspector
          {...alertProps}
          past={past}
          available={available}
          upcoming={upcoming}
          note={category.note}
          onNoteChange={(note) => onNoteChange(only, note)}
          target={
            assign && (
              <TargetSection
                key={only}
                name={category.name}
                target={category.target}
                need={totals.target}
                format={format}
                parse={assign.parse}
                toInput={assign.toInput}
                dateFormat={budget.dateFormat}
                onSave={(input) => targetActions.save(only, month.month, input, category.target)}
                onDelete={() => targetActions.remove(only, category.target)}
                onAssign={
                  month.month < figures.currentMonth
                    ? undefined
                    : (amount) => assign.assign(only, BigInt(totals.assigned) + amount)
                }
                payment={{
                  month: month.month,
                  fundedSpending: totals.payment.fundedSpending,
                  paymentsMade: totals.payment.paymentsMade,
                  overpaid: totals.available.startsWith("-"),
                  past,
                  alert: (createTarget) => (
                    <PaymentAlert {...alertProps} onCreateTarget={createTarget} />
                  ),
                }}
              />
            )
          }
        />
      );
    }
    return (
      <CategoryInspector
        name={category.name}
        totals={breakdown(totals)}
        format={format}
        pairedWith={pairedLoan && <PairedWith loan={pairedLoan} />}
        loan={
          pairedLoan &&
          month.month === figures.currentMonth && (
            <PairedLoanSection
              loan={pairedLoan}
              categoryId={only}
              categoryName={category.name}
              available={totals.available}
              move={figures.move}
            />
          )
        }
        available={available}
        upcoming={upcoming}
        note={category.note}
        onNoteChange={(note) => onNoteChange(only, note)}
        target={
          assign && (
            <TargetSection
              key={only}
              name={category.name}
              target={category.target}
              need={totals.target}
              format={format}
              parse={assign.parse}
              toInput={assign.toInput}
              dateFormat={budget.dateFormat}
              onSave={(input) => targetActions.save(only, month.month, input, category.target)}
              onDelete={() => targetActions.remove(only, category.target)}
              onAssign={
                // YNAB leaves the Assign button out in past months (seen 2026-10-08).
                month.month < figures.currentMonth
                  ? undefined
                  : (amount) => assign.assign(only, BigInt(totals.assigned) + amount)
              }
              snoozeLocked={month.month !== figures.currentMonth}
              debt={
                pairedLoan
                  ? { plan: loanPlan }
                  : // A loan unpaired or closed leaves its debt target (YNAB, 2026-10-14).
                    category.target?.cadence === "debt_monthly"
                    ? { plan: null, unpairedCategoryId: only }
                    : undefined
              }
              onSnooze={
                month.month === figures.currentMonth
                  ? async (snoozed) => {
                      const snooze = (on: boolean) =>
                        targetActions.snooze(only, month.month, on).then(() => undefined);
                      if (!(await targetActions.snooze(only, month.month, snoozed))) return;
                      history.record({
                        label: snoozed ? "snooze target" : "wake target",
                        undo: () => snooze(!snoozed),
                        redo: () => snooze(snoozed),
                      });
                    }
                  : undefined
              }
            />
          )
        }
      />
    );
  }
  if (selection.size > 1) {
    const names = [...selection].map((id) =>
      id === UNCATEGORIZED ? "Uncategorized Transactions" : (listed.get(id)?.name ?? ""),
    );
    return (
      <MonthSummary
        month={month.month}
        totals={summarize(month, selection)}
        format={format}
        selectedNames={names}
      />
    );
  }
  // Under All, YNAB's summary covers every category, hidden ones included.
  const ids = shown ?? [
    ...month.categories.map((c) => c.categoryId),
    ...(month.uncategorized ? [UNCATEGORIZED] : []),
  ];
  return (
    <MonthSummary
      month={month.month}
      totals={summarize(month, ids)}
      format={format}
      // The whole plan's targets, whatever the view; YNAB shows them in the current month only.
      targets={
        month.month === figures.currentMonth
          ? {
              month: BigInt(month.targets.month),
              nextMonth: BigInt(month.targets.nextMonth),
              expectedIncome:
                month.targets.expectedIncome === null ? null : BigInt(month.targets.expectedIncome),
              onSetIncome: assign && targetActions.setExpectedIncome,
              parse: assign?.parse,
              toInput: assign?.toInput,
            }
          : undefined
      }
    />
  );
}
