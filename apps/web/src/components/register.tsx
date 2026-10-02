import { money, usesCategory } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { Checkbox } from "@everycent/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@everycent/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@everycent/ui/components/empty";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { Skeleton } from "@everycent/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@everycent/ui/components/table";
import { cn } from "@everycent/ui/lib/utils";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Circle,
  CircleCheck,
  CircleHelp,
  Lock,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Split,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type Account, accountsQueryOptions } from "@/lib/accounts";
import { $api, apiClient } from "@/lib/api";
import { useBudget } from "@/lib/budget-context";
import { apiErrorMessage } from "@/lib/budgets";
import { categoriesQueryOptions } from "@/lib/categories";
import { todayIso } from "@/lib/dates";
import { type Flag, type FlagColor, flagsQueryOptions } from "@/lib/flags";
import { invalidateMonths } from "@/lib/months";
import {
  nextSort,
  type RegisterSearch,
  registerQuery,
  type SortColumn,
  searchText,
} from "@/lib/register-filters";
import { useRegisterView } from "@/lib/register-view";
import {
  isEmpty,
  isSelected,
  NOTHING,
  rangeTo,
  type Selection,
  selectionBody,
  setSelected,
} from "@/lib/selection";
import { createBodyFromTransaction, updateBodyFromTransaction } from "@/lib/transaction-history";
import {
  type CellColumn,
  categoryOptions,
  cellUpdate,
  createBody,
  type Draft,
  draftFrom,
  emptyDraft,
  payeesQueryOptions,
  REGISTER_PAGE_SIZE,
  type SubTransaction,
  startSplit,
  type Transaction,
  transactionsQueryPrefix,
  updateBody,
} from "@/lib/transactions";
import { useUndo } from "@/lib/undo";
import { CellEditor, type CellExit } from "./cell-editor";
import { FlagMenu } from "./flag-menu";
import { COLUMN_SPECS, type ColumnId, isEditable, registerColumns } from "./register-columns";
import { RegisterSearchBox } from "./register-search-box";
import { RegisterViewMenu } from "./register-view-menu";
import { type BulkAction, SelectionBar } from "./selection-bar";
import { TransactionEditor } from "./transaction-editor";
import { UndoRedoButtons } from "./undo-redo-buttons";

/** Columns a header click sorts by; the amount columns both sort by amount. */
const SORTABLE: Partial<Record<ColumnId, SortColumn>> = {
  account: "account",
  date: "date",
  payee: "payee",
  category: "category",
  memo: "memo",
  outflow: "amount",
  inflow: "amount",
  cleared: "cleared",
};

const features = tableFeatures({});
const column = createColumnHelper<typeof features, Transaction>();
const EMPTY: Transaction[] = [];
const ROW_HEIGHT = 41;

interface EditingCell {
  id: string;
  column: CellColumn;
}

/** A register row: a transaction, or one line of a split under it. */
type Item =
  | { kind: "transaction"; key: string; t: Transaction }
  | { kind: "line"; key: string; t: Transaction; line: SubTransaction };

/** The whole-transaction editor open on an existing row (splits are edited all at once). */
interface EditingSplit {
  id: string;
  draft: Draft;
}

/**
 * An account's register, or all accounts' (`accountId` left out), newest first unless sorted.
 * New transactions get a full row; existing ones are edited a cell at a time, as in YNAB.
 * The server filters, sorts and pages (`search`, kept in the address by the page); more pages
 * load as you scroll, and rows are virtualized so long histories stay fast. `focusId` scrolls to
 * that transaction and highlights it (the other side of a transfer, when jumping to it).
 */
export function Register({
  accountId,
  focusId,
  search,
  onSearchChange,
}: {
  accountId?: string;
  focusId?: string;
  search: RegisterSearch;
  onSearchChange: (patch: Partial<RegisterSearch>, replace?: boolean) => void;
}) {
  const { budget, formatAmount, formatDate } = useBudget();
  const history = useUndo();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useRegisterView(budget.id, accountId ?? "all");
  const query = registerQuery(accountId, search, view);
  const transactions = useInfiniteQuery({
    queryKey: [...transactionsQueryPrefix, budget.id, query],
    queryFn: async ({ pageParam, signal }) => {
      // Not `$api.useInfiniteQuery`: it sends `cursor=0` for the first page.
      const { data, error } = await apiClient.GET("/v1/budgets/{budgetId}/transactions", {
        params: {
          path: { budgetId: budget.id },
          query: {
            ...query,
            limit: REGISTER_PAGE_SIZE,
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        signal,
      });
      if (error) throw error;
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // Keeps the old rows on screen while a new search or filter loads.
    placeholderData: keepPreviousData,
  });
  const loaded = useMemo(
    () => transactions.data?.pages.flatMap((p) => p.transactions) ?? EMPTY,
    [transactions.data],
  );
  const someHidden = transactions.data?.pages[0]?.someHidden ?? false;
  const dateOrder = query.sort === "date";
  const accounts = useQuery(accountsQueryOptions(budget.id));
  const categories = useQuery(categoriesQueryOptions(budget.id));
  const payees = useQuery(payeesQueryOptions(budget.id));
  const flagList = useQuery(flagsQueryOptions(budget.id));
  const renameFlagMutation = $api.useMutation("put", "/v1/budgets/{budgetId}/flags/{color}");
  const create = $api.useMutation("post", "/v1/budgets/{budgetId}/transactions");
  const update = $api.useMutation("patch", "/v1/budgets/{budgetId}/transactions/{transactionId}");
  const remove = $api.useMutation("delete", "/v1/budgets/{budgetId}/transactions/{transactionId}");
  const [adding, setAdding] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [editingSplit, setEditingSplit] = useState<EditingSplit | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(NOTHING);
  const anchor = useRef<string | null>(null);
  const bulk = $api.useMutation("post", "/v1/budgets/{budgetId}/transactions/bulk");
  // A new search or filter is a new set of rows, so the selection starts over.
  const queryKey = JSON.stringify(query);
  const [selectionKey, setSelectionKey] = useState(queryKey);
  if (selectionKey !== queryKey) {
    setSelectionKey(queryKey);
    setSelection(NOTHING);
    anchor.current = null;
  }

  const allAccounts = accountId === undefined;
  const columnIds = useMemo(
    () =>
      registerColumns(allAccounts).filter(
        (c) => (c !== "balance" || view.showRunningBalance) && (c !== "flag" || view.showFlags),
      ),
    [allAccounts, view.showRunningBalance, view.showFlags],
  );
  const today = todayIso();
  const show = (amount: bigint) => formatAmount(money(amount, budget.currency));

  const accountList = accounts.data?.accounts ?? [];
  const accountById = useMemo(() => new Map(accountList.map((a) => [a.id, a])), [accountList]);
  const openAccounts = accountList.filter((a) => !a.closed);
  const account = accountId ? accountById.get(accountId) : undefined;
  const options = useMemo(
    () => (categories.data ? categoryOptions(categories.data) : []),
    [categories.data],
  );
  const payeeList = payees.data?.payees ?? [];
  const flags = flagList.data?.flags ?? [];
  const searchSources = useMemo(
    () => ({ categories: options, accounts: accountList, flags, settings: budget }),
    [options, accountList, flags, budget],
  );

  const tableColumns = useMemo(
    () =>
      column.columns(
        columnIds.map((id) => column.display({ id, header: COLUMN_SPECS[id].header })),
      ),
    [columnIds],
  );
  const table = useTable({
    features,
    columns: tableColumns,
    data: loaded,
    getRowId: (t) => t.id,
  });
  const rows = table.getRowModel().rows;
  // Split lines sit right under their transaction (read-only; the split is edited as a whole).
  const flat = useMemo(
    () =>
      rows.flatMap(({ original: t }): Item[] => [
        { kind: "transaction", key: t.id, t },
        // Under a search, YNAB shows only the lines that match it.
        ...t.subtransactions
          .filter((line) => t.matchingLineIds === null || t.matchingLineIds.includes(line.id))
          .map((line): Item => ({ kind: "line", key: `${t.id}:${line.id}`, t, line })),
      ]),
    [rows],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => flat[index]?.key ?? index,
    overscan: 12,
    // Lets jsdom (no layout) render the first screen of rows.
    initialRect: { width: 1280, height: 800 },
  });
  const items = virtualizer.getVirtualItems();

  // Loads the next page as the last loaded rows scroll into view.
  const lastIndex = items.at(-1)?.index ?? -1;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = transactions;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= flat.length - 20) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, lastIndex, flat.length]);

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || focused.current === focusId) return;
    const index = flat.findIndex((r) => r.key === focusId);
    if (index === -1) {
      // The other side of a transfer may be further back; load pages until it shows up.
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
      return;
    }
    focused.current = focusId;
    virtualizer.scrollToIndex(index, { align: "center" });
    setHighlightId(focusId);
    const timer = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(timer);
  }, [focusId, flat, virtualizer, hasNextPage, isFetchingNextPage, fetchNextPage]);
  const loadedIds = useMemo(() => loaded.map((t) => t.id), [loaded]);
  // The selection's filter is the register's, without the sort.
  const { sort: _sort, dir: _dir, hideReconciled, ...rest } = query;
  const selectionFilter = { ...rest, ...(hideReconciled ? { hideReconciled: true } : {}) };
  const summary = $api.useQuery(
    "post",
    "/v1/budgets/{budgetId}/transactions/selection",
    {
      params: { path: { budgetId: budget.id } },
      body: { selection: selectionBody(selection, selectionFilter) },
    },
    { enabled: !isEmpty(selection) },
  );

  function toggleRow(id: string, on: boolean, shift: boolean) {
    const ids = shift ? rangeTo(loadedIds, anchor.current, id) : [id];
    anchor.current = id;
    setSelection((s) => setSelected(s, ids, on));
  }

  async function applyBulk(action: BulkAction) {
    try {
      const result = await bulk.mutateAsync({
        params: { path: { budgetId: budget.id } },
        body: { selection: selectionBody(selection, selectionFilter), action },
      });
      if (result.updated > 0) recordBulk(action, result.before);
      await refresh();
      setSelection(NOTHING);
      const n = `${result.updated} transaction${result.updated === 1 ? "" : "s"}`;
      toast.success(
        action.type === "delete"
          ? `Deleted ${n}`
          : action.type === "move"
            ? `Moved ${n}`
            : `Updated ${n}`,
      );
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't update the selected transactions."));
    }
  }

  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: transactionsQueryPrefix }),
      queryClient.invalidateQueries({ queryKey: accountsQueryOptions(budget.id).queryKey }),
      queryClient.invalidateQueries({ queryKey: payeesQueryOptions(budget.id).queryKey }),
      queryClient.invalidateQueries({ queryKey: categoriesQueryOptions(budget.id).queryKey }),
      invalidateMonths(queryClient),
      // The selection's count and total.
      queryClient.invalidateQueries({
        queryKey: ["post", "/v1/budgets/{budgetId}/transactions/selection"],
      }),
    ]);
  }

  function recordBulk(action: BulkAction, before: Transaction[]) {
    let current = before;
    const restore = async () => {
      if (action.type === "delete") {
        const restored: Transaction[] = [];
        for (const transaction of before) {
          restored.push(
            await create.mutateAsync({
              params: { path: { budgetId: budget.id } },
              body: createBodyFromTransaction(transaction),
            }),
          );
        }
        current = restored;
      } else {
        for (const transaction of before) {
          await update.mutateAsync({
            params: { path: { budgetId: budget.id, transactionId: transaction.id } },
            body: updateBodyFromTransaction(transaction),
          });
        }
        current = before;
      }
      await refresh();
    };
    const reapply = async () => {
      if (action.type === "delete") {
        for (const transaction of current) {
          await remove.mutateAsync({
            params: { path: { budgetId: budget.id, transactionId: transaction.id } },
          });
        }
      } else {
        await bulk.mutateAsync({
          params: { path: { budgetId: budget.id } },
          body: { selection: { ids: current.map((transaction) => transaction.id) }, action },
        });
      }
      await refresh();
    };
    history.record({
      label: `${action.type} ${before.length} transaction${before.length === 1 ? "" : "s"}`,
      undo: restore,
      redo: reapply,
    });
  }

  function recordUpdate(label: string, before: Transaction, after: Transaction) {
    history.record({
      label,
      undo: async () => {
        await update.mutateAsync({
          params: { path: { budgetId: budget.id, transactionId: before.id } },
          body: updateBodyFromTransaction(before),
        });
        await refresh();
      },
      redo: async () => {
        await update.mutateAsync({
          params: { path: { budgetId: budget.id, transactionId: after.id } },
          body: updateBodyFromTransaction(after),
        });
        await refresh();
      },
    });
  }

  /** Whether `t` has a category: not in tracking accounts, nor on in-budget transfers. */
  function hasCategory(t: Transaction) {
    const type = accountById.get(t.accountId)?.type ?? "checking";
    const transferType = t.transferAccountId ? accountById.get(t.transferAccountId)?.type : null;
    return usesCategory(type, transferType);
  }

  /**
   * The cells of `t` that can be edited, in Tab order. A split's transfer side only takes its
   * memo and category; the split owns the rest.
   */
  function editableColumns(t: Transaction): CellColumn[] {
    const categorized = hasCategory(t);
    return columnIds.filter(
      (c): c is CellColumn =>
        isEditable(c) &&
        (c !== "category" || categorized) &&
        (!t.transferFromSplit || c === "memo" || c === "category"),
    );
  }

  /** Splits open as a whole, as do transactions being split from the category cell. */
  function openSplit(t: Transaction, split = false) {
    const draft = draftFrom(t, budget);
    setEditing(null);
    setAdding(false);
    setSplitError(null);
    setEditingSplit({ id: t.id, draft: split ? startSplit(draft) : draft });
  }

  async function saveSplit(t: Transaction, draft: Draft) {
    if (!draft.date) return setSplitError("Enter a date.");
    const result = updateBody(t, draft, budget);
    if (!result.ok) return setSplitError(result.error);
    try {
      if (Object.keys(result.body).length > 0) {
        const after = await update.mutateAsync({
          params: { path: { budgetId: budget.id, transactionId: t.id } },
          body: result.body,
        });
        recordUpdate("transaction edit", t, after);
        await refresh();
      }
      setEditingSplit(null);
    } catch (e) {
      setSplitError(apiErrorMessage(e, "Couldn't save the split."));
    }
  }

  /** Accounts the payee cell offers transfers to: other open ones, plus the current target. */
  function transferTargets(t: Transaction) {
    return accountList.filter(
      (a) => a.id !== t.accountId && (!a.closed || a.id === t.transferAccountId),
    );
  }

  function jumpToOtherSide(t: Transaction) {
    if (!t.transferAccountId || !t.transferTransactionId) return;
    // The other register opens unfiltered, so the other side is in it.
    void navigate({
      to: "/budgets/$budgetId/accounts/$accountId",
      params: { budgetId: budget.id, accountId: t.transferAccountId },
      search: { transaction: t.transferTransactionId },
    });
  }

  function startAdding() {
    setEditing(null);
    setEditingSplit(null);
    setNewError(null);
    setAdding(true);
  }

  async function saveNew(draft: Draft) {
    if (!draft.date) return setNewError("Enter a date.");
    const result = createBody(draft, budget);
    if (!result.ok) return setNewError(result.error);
    try {
      const created = await create.mutateAsync({
        params: { path: { budgetId: budget.id } },
        body: result.body,
      });
      let current = created;
      history.record({
        label: "new transaction",
        undo: async () => {
          await remove.mutateAsync({
            params: { path: { budgetId: budget.id, transactionId: current.id } },
          });
          await refresh();
        },
        redo: async () => {
          current = await create.mutateAsync({
            params: { path: { budgetId: budget.id } },
            body: createBodyFromTransaction(created),
          });
          await refresh();
        },
      });
      setAdding(false);
      await refresh();
    } catch (e) {
      setNewError(apiErrorMessage(e, "Couldn't save the transaction."));
    }
  }

  async function commitCell(
    t: Transaction,
    cell: CellColumn,
    value: string | null,
    exit: CellExit,
    transferAccountId: string | null,
  ) {
    const result = cellUpdate(t, cell, value, budget, transferAccountId);
    if (!result.ok) {
      toast.error(result.error);
      setEditing({ id: t.id, column: cell });
      return;
    }
    const order = editableColumns(t);
    const next = order[order.indexOf(cell) + (exit === "next" ? 1 : -1)];
    setEditing(exit !== "stay" && next ? { id: t.id, column: next } : null);
    if (Object.keys(result.body).length === 0) return;
    try {
      const after = await update.mutateAsync({
        params: { path: { budgetId: budget.id, transactionId: t.id } },
        body: result.body,
      });
      recordUpdate("transaction edit", t, after);
      await refresh();
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't save the change."));
    }
  }

  async function setFlag(t: Transaction, flag: FlagColor | null) {
    try {
      const after = await update.mutateAsync({
        params: { path: { budgetId: budget.id, transactionId: t.id } },
        body: { flag },
      });
      recordUpdate("transaction flag", t, after);
      await refresh();
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't change the flag."));
    }
  }

  /** Flag names are the budget's, so everyone on it sees the new ones. */
  async function renameFlags(changes: Flag[]) {
    try {
      for (const { color, name } of changes) {
        await renameFlagMutation.mutateAsync({
          params: { path: { budgetId: budget.id, color } },
          body: { name },
        });
      }
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't rename the flags."));
      throw e;
    } finally {
      await queryClient.invalidateQueries({ queryKey: flagsQueryOptions(budget.id).queryKey });
    }
  }

  async function toggleCleared(t: Transaction) {
    try {
      const after = await update.mutateAsync({
        params: { path: { budgetId: budget.id, transactionId: t.id } },
        body: { cleared: t.cleared === "uncleared" ? "cleared" : "uncleared" },
      });
      recordUpdate("transaction cleared state", t, after);
      await refresh();
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't update the transaction."));
    }
  }

  async function handleDelete(t: Transaction) {
    try {
      await remove.mutateAsync({
        params: { path: { budgetId: budget.id, transactionId: t.id } },
      });
      let current: Transaction | null = null;
      history.record({
        label: "deleted transaction",
        undo: async () => {
          current = await create.mutateAsync({
            params: { path: { budgetId: budget.id } },
            body: createBodyFromTransaction(t),
          });
          await refresh();
        },
        redo: async () => {
          if (!current) return;
          await remove.mutateAsync({
            params: { path: { budgetId: budget.id, transactionId: current.id } },
          });
          await refresh();
        },
      });
      await refresh();
      const transfers = t.transferAccountId || t.subtransactions.some((l) => l.transferAccountId);
      toast.success(transfers ? "Deleted, with its transfers" : "Transaction deleted");
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't delete the transaction."));
    }
  }

  const defaultAccountId = accountId ?? openAccounts[0]?.id;
  const canAdd = defaultAccountId !== undefined && (allAccounts || account?.closed === false);

  if (transactions.isPending) return <Skeleton className="h-64" />;
  if (transactions.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {apiErrorMessage(transactions.error, "Couldn't load the transactions.")}
      </p>
    );
  }
  const q = searchText(search);
  const sort = query.sort;
  const dir = query.dir;

  function display(t: Transaction, id: ColumnId) {
    const amount = BigInt(t.amount);
    switch (id) {
      case "select":
        return (
          <Checkbox
            aria-label={`Select ${t.payeeName ?? "transaction"} on ${formatDate(t.date)}`}
            checked={isSelected(selection, t.id)}
            onClick={(e) => {
              e.preventDefault();
              toggleRow(t.id, !isSelected(selection, t.id), e.shiftKey);
            }}
          />
        );
      case "flag":
        return (
          <FlagMenu
            value={t.flag}
            flags={flags}
            onChange={(flag) => void setFlag(t, flag)}
            onRename={renameFlags}
          />
        );
      case "account":
        return t.accountName;
      case "date":
        return formatDate(t.date);
      case "payee":
        return t.transferAccountId ? (
          <span className="flex min-w-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="-ml-1 shrink-0 text-muted-foreground"
              aria-label={`Go to the matching transaction in ${
                accountById.get(t.transferAccountId)?.name ?? "the other account"
              }`}
              title="Go to the other side of this transfer"
              onClick={(e) => {
                e.stopPropagation();
                jumpToOtherSide(t);
              }}
            >
              <ArrowLeftRight />
            </Button>
            <span className="truncate">{t.payeeName}</span>
          </span>
        ) : (
          t.payeeName
        );
      case "category":
        if (t.subtransactions.length > 0) {
          const count = new Set(t.subtransactions.map((l) => l.categoryId ?? l.transferAccountId))
            .size;
          return (
            <span className="flex items-center gap-1.5">
              <Split className="size-4 shrink-0" />
              <span className="truncate">
                Split ({count} {count === 1 ? "category" : "categories"})
              </span>
            </span>
          );
        }
        return hasCategory(t) ? t.categoryName : "";
      case "memo":
        return t.memo;
      case "outflow":
        return amount < 0n ? show(-amount) : "";
      case "inflow":
        return amount > 0n ? show(amount) : "";
      case "balance": {
        const balance = BigInt(t.runningBalance);
        return <span className={cn(balance < 0n && "text-destructive")}>{show(balance)}</span>;
      }
      case "cleared":
        return t.cleared === "reconciled" ? (
          <Lock className="mx-auto size-4 text-muted-foreground" aria-label="Reconciled" />
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t.cleared === "cleared" ? "Mark uncleared" : "Mark cleared"}
            onClick={() => void toggleCleared(t)}
          >
            {t.cleared === "cleared" ? (
              <CircleCheck className="text-primary" />
            ) : (
              <Circle className="text-muted-foreground" />
            )}
          </Button>
        );
      case "actions":
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Transaction actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hasCategory(t) && !t.transferFromSplit && t.subtransactions.length === 0 && (
                <DropdownMenuItem onSelect={() => openSplit(t, true)}>
                  <Split /> Split
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                disabled={t.transferFromSplit}
                onSelect={() => void handleDelete(t)}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
    }
  }

  /** A split line, indented under its transaction. */
  function lineDisplay(t: Transaction, line: SubTransaction, id: ColumnId) {
    const amount = BigInt(line.amount);
    switch (id) {
      case "payee":
        return (
          <span className="flex min-w-0 items-center gap-1 pl-4">
            {line.transferAccountId && (
              <ArrowLeftRight className="size-3.5 shrink-0" aria-label="Transfer" />
            )}
            <span className="truncate">{line.payeeName}</span>
          </span>
        );
      case "category": {
        const type = accountById.get(t.accountId)?.type ?? "checking";
        const to = line.transferAccountId ? accountById.get(line.transferAccountId)?.type : null;
        return usesCategory(type, to) ? line.categoryName : "";
      }
      case "memo":
        return line.memo;
      case "outflow":
        return amount < 0n ? show(-amount) : "";
      case "inflow":
        return amount > 0n ? show(amount) : "";
      default:
        return null;
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={startAdding} disabled={!canAdd || adding}>
          <Plus /> Add transaction
        </Button>
        {!canAdd && account?.closed && (
          <p className="text-muted-foreground text-sm">Reopen this account to add transactions.</p>
        )}
        <div className="ml-auto flex items-center gap-1">
          <UndoRedoButtons />
          <RegisterViewMenu view={view} onChange={setView} runningBalance={!allAccounts} />
          <RegisterSearchBox
            value={search.q ?? ""}
            onCommit={(text) => onSearchChange({ q: text.trim() ? text : undefined })}
            placeholder={allAccounts ? "Search All Accounts" : `Search ${account?.name ?? ""}`}
            sources={searchSources}
          />
        </div>
      </div>
      {!isEmpty(selection) && (
        <SelectionBar
          summary={summary.data}
          total={summary.data ? show(BigInt(summary.data.total)) : null}
          allMatching={selection.mode === "all"}
          canSelectAll={Boolean(hasNextPage) || loaded.length > (summary.data?.count ?? 0)}
          onSelectAll={() => setSelection({ mode: "all", except: new Set() })}
          onClear={() => setSelection(NOTHING)}
          flags={flags}
          categories={options}
          moveTargets={openAccounts.filter((a) => a.id !== accountId)}
          pending={bulk.isPending}
          onAction={(action) => void applyBulk(action)}
        />
      )}

      <Table
        containerRef={scrollRef}
        containerClassName="max-h-[70vh] overflow-auto rounded-lg border"
        className="min-w-[74rem] table-fixed"
      >
        <colgroup>
          {columnIds.map((id) => (
            <col key={id} style={{ width: COLUMN_SPECS[id].width }} />
          ))}
        </colgroup>
        <TableHeader className="sticky top-0 z-10">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const id = header.column.id as ColumnId;
                const spec = COLUMN_SPECS[id];
                const sortBy = SORTABLE[id];
                // Outflow sorts biggest spend first; inflow biggest income first. Both sort by
                // amount, so the arrow goes on the one whose natural order is showing.
                const natural = id === "outflow" ? "asc" : id === "inflow" ? "desc" : undefined;
                const active =
                  sortBy !== undefined &&
                  sortBy === sort &&
                  (sortBy !== "amount" || id === (dir === "asc" ? "outflow" : "inflow"));
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "bg-muted text-muted-foreground text-xs uppercase",
                      spec.align === "right" && "text-right",
                    )}
                  >
                    {id === "select" ? (
                      <Checkbox
                        aria-label={
                          selection.mode === "all" ? "Unselect all" : "Select all matching"
                        }
                        checked={
                          selection.mode === "all"
                            ? selection.except.size === 0 || "indeterminate"
                            : selection.ids.size > 0 && "indeterminate"
                        }
                        disabled={loaded.length === 0}
                        onCheckedChange={() =>
                          setSelection(
                            selection.mode === "all" ? NOTHING : { mode: "all", except: new Set() },
                          )
                        }
                      />
                    ) : id === "balance" ? (
                      <BalanceHeader
                        sorted={!dateOrder}
                        onResetSort={() => onSearchChange({ sort: undefined, dir: undefined })}
                      />
                    ) : sortBy && !spec.srOnly ? (
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1 uppercase hover:text-foreground",
                          active && "text-foreground",
                        )}
                        onClick={() => onSearchChange(nextSort(search, sortBy, natural))}
                      >
                        {spec.header}
                        {active &&
                          (dir === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3" aria-hidden />
                          ))}
                      </button>
                    ) : (
                      <span className={cn(spec.srOnly && "sr-only")}>{spec.header}</span>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {adding && defaultAccountId && (
            <TransactionEditor
              initial={emptyDraft(defaultAccountId, today)}
              columns={columnIds}
              accounts={openAccounts}
              payees={payeeList}
              categories={options}
              dateFormat={budget.dateFormat}
              settings={budget}
              flags={flags}
              onRenameFlags={renameFlags}
              pending={create.isPending}
              error={newError}
              onSave={(draft) => void saveNew(draft)}
              onCancel={() => setAdding(false)}
            />
          )}
          {paddingTop > 0 && <tr aria-hidden style={{ height: paddingTop }} />}
          {items.map((item) => {
            const row = flat[item.index];
            if (!row) return null;
            const t = row.t;
            const future = t.date > today;
            if (editingSplit?.id === t.id) {
              if (row.kind === "line") return null;
              return (
                <TransactionEditor
                  key={t.id}
                  initial={editingSplit.draft}
                  label="Edit transaction"
                  columns={columnIds}
                  accounts={editorAccounts(accountList, t.accountId)}
                  payees={payeeList}
                  categories={options}
                  dateFormat={budget.dateFormat}
                  settings={budget}
                  flags={flags}
                  onRenameFlags={renameFlags}
                  pending={update.isPending}
                  error={splitError}
                  onSave={(draft) => void saveSplit(t, draft)}
                  onCancel={() => setEditingSplit(null)}
                />
              );
            }
            if (row.kind === "line") {
              return (
                <TableRow
                  key={row.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  aria-label={`Split line of ${t.payeeName ?? "transaction"}`}
                  className={cn("text-muted-foreground text-xs", future && "italic")}
                >
                  {columnIds.map((id) => {
                    const spec = COLUMN_SPECS[id];
                    return (
                      <TableCell
                        key={id}
                        className={cn(
                          "truncate py-1.5",
                          spec.align === "right" && "text-right tabular-nums",
                          isEditable(id) && "cursor-text",
                        )}
                        onClick={isEditable(id) ? () => openSplit(t) : undefined}
                      >
                        {lineDisplay(t, row.line, id)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            }
            const editable = editableColumns(t);
            return (
              <TableRow
                key={t.id}
                data-index={item.index}
                ref={virtualizer.measureElement}
                data-highlighted={highlightId === t.id || undefined}
                className={cn(
                  "transition-colors duration-700 data-highlighted:bg-primary/10",
                  future && "text-muted-foreground italic",
                )}
                title={future ? "Upcoming: not in the balance until its date" : undefined}
              >
                {columnIds.map((id) => {
                  const spec = COLUMN_SPECS[id];
                  if (editing?.id === t.id && editing.column === id) {
                    return (
                      <TableCell key={id} className="px-1.5 py-1">
                        <CellEditor
                          transaction={t}
                          column={editing.column}
                          settings={budget}
                          dateFormat={budget.dateFormat}
                          accounts={editorAccounts(accountList, t.accountId)}
                          payees={payeeList}
                          transfers={transferTargets(t)}
                          categories={options}
                          onSplit={
                            !t.transferFromSplit && !t.transferAccountId
                              ? () => openSplit(t, true)
                              : undefined
                          }
                          onCommit={(value, exit, transferAccountId) =>
                            void commitCell(t, editing.column, value, exit, transferAccountId)
                          }
                          onCancel={() => setEditing(null)}
                        />
                      </TableCell>
                    );
                  }
                  const canEdit = (editable as ColumnId[]).includes(id);
                  return (
                    <TableCell
                      key={id}
                      className={cn(
                        "truncate",
                        spec.align === "right" && "text-right tabular-nums",
                        spec.align === "center" && "py-1 text-center",
                        id === "flag" && "px-1",
                        id === "actions" && "py-1",
                        (id === "category" || id === "memo") && "text-muted-foreground",
                        canEdit && "cursor-text",
                      )}
                      onClick={
                        canEdit
                          ? () =>
                              t.subtransactions.length > 0
                                ? openSplit(t)
                                : setEditing({ id: t.id, column: id as CellColumn })
                          : undefined
                      }
                    >
                      {display(t, id)}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
          {paddingBottom > 0 && <tr aria-hidden style={{ height: paddingBottom }} />}
        </TableBody>
      </Table>

      {isFetchingNextPage && (
        <p className="text-muted-foreground text-xs" aria-live="polite">
          Loading more…
        </p>
      )}
      {someHidden && (
        <div className="grid justify-items-center gap-2 py-2 text-sm">
          <p className="text-muted-foreground">
            {q ? (
              <>
                Some transactions are hidden by your search for "
                <strong className="text-foreground">{q}</strong>".
              </>
            ) : (
              "Some transactions are hidden by filters."
            )}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setView({ range: "all", from: undefined, to: undefined, showReconciled: true });
              onSearchChange({ q: undefined });
            }}
          >
            View All
          </Button>
        </div>
      )}
      {rows.length === 0 && !adding && !someHidden && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptText />
            </EmptyMedia>
            <EmptyTitle>No transactions yet</EmptyTitle>
            <EmptyDescription>Add one to start tracking where your money goes.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

/**
 * The running balance is always in date order. Sorted by anything else, YNAB keeps the column
 * and explains: clicking it goes back to the default order.
 */
function BalanceHeader({ sorted, onResetSort }: { sorted: boolean; onResetSort: () => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        className="uppercase hover:text-foreground"
        title="Sort by date (the balance's order)"
        onClick={onResetSort}
      >
        Balance
      </button>
      {sorted && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="About the balance" className="hover:text-foreground">
              <CircleHelp className="size-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 text-sm normal-case">
            Click the column header to return to the default balance sort order.
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

/** Accounts a transaction can move to: open ones, plus the one it's in. */
function editorAccounts(accounts: readonly Account[], current: string) {
  return accounts.filter((a) => !a.closed || a.id === current);
}
