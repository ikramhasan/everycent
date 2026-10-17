import { money, usesCategory } from "@everycent/engine";
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
import { ScrollArea } from "@everycent/ui/components/scroll-area";
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
  Bookmark,
  Check,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleHelp,
  CircleX,
  CreditCard,
  History,
  Lock,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Repeat,
  Split,
  Trash2,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type Account, accountsQueryOptions } from "@/lib/accounts";
import { $api, apiClient } from "@/lib/api";
import { useBudget } from "@/lib/budget-context";
import { apiErrorMessage } from "@/lib/budgets";
import { categoriesQueryOptions } from "@/lib/categories";
import { categoryNotNeeded } from "@/lib/category-cell";
import { useCollapsedSplits } from "@/lib/collapsed-splits";
import { todayIso } from "@/lib/dates";
import { exportSelected } from "@/lib/exports";
import { FLAG_CLASS, type Flag, type FlagColor, flagLabel, flagsQueryOptions } from "@/lib/flags";
import { inCurrency } from "@/lib/money-input";
import { currentMonth, invalidateMonths, monthQueryOptions } from "@/lib/months";
import {
  deleteWarning,
  editWarning,
  type ReconciledWarning,
  rowDeleteScope,
} from "@/lib/reconciled-warnings";
import { type RegisterSearch, registerQuery, searchText } from "@/lib/register-filters";
import { DEFAULT_SORT, nextSort, type SortColumn, type SortField } from "@/lib/register-sort";
import {
  addMonths,
  rangeDates,
  savedSearch,
  saveSearch,
  useRegisterView,
} from "@/lib/register-view";
import {
  isScheduled,
  makeRepeatingDraft,
  rescheduleBody,
  type ScheduledTransaction,
  scheduleCreateBody,
  scheduledQueryPrefix,
  scheduledSplits,
  scheduleRestoreBody,
} from "@/lib/scheduled";
import {
  isEmpty,
  isSelected,
  NOTHING,
  rangeTo,
  type Selection,
  selectionBody,
  setSelected,
} from "@/lib/selection";
import { sessionQueryOptions } from "@/lib/session";
import { createBodyFromTransaction, updateBodyFromTransaction } from "@/lib/transaction-history";
import {
  type CellColumn,
  categoryOptions,
  cellUpdate,
  createBody,
  type Draft,
  draftFrom,
  emptyDraft,
  movableAccounts,
  payeesQueryOptions,
  paymentCategoryCard,
  REGISTER_PAGE_SIZE,
  type SubTransaction,
  startSplit,
  type Transaction,
  transactionsQueryPrefix,
  transferRowLabel,
  updateBody,
} from "@/lib/transactions";
import { type UndoCommand, useUndo } from "@/lib/undo";
import { CellEditor, type CellExit } from "./cell-editor";
import { ChangeHistoryDialog } from "./change-history-dialog";
import { FileImportButton } from "./file-import";
import { FlagMenu } from "./flag-menu";
import { MemberAvatar } from "./member-avatar";
import {
  COLUMN_SPECS,
  type ColumnId,
  isEditable,
  PINNED_BG,
  pinned,
  registerColumns,
} from "./register-columns";
import { RegisterSearchBox } from "./register-search-box";
import { RegisterViewMenu } from "./register-view-menu";
import { NeedsCategoryPill, ReviewCell } from "./review-cell";
import { ScheduledSection } from "./scheduled-section";
import { type BulkAction, SelectionBar } from "./selection-bar";
import { TransactionEditor } from "./transaction-editor";
import { UndoRedoButtons } from "./undo-redo-buttons";

/** Columns a header click sorts by (YNAB's: Outflow and Inflow apart, the flag too). */
const SORTABLE: Partial<Record<ColumnId, SortColumn>> = {
  flag: "flag",
  account: "account",
  date: "date",
  payee: "payee",
  category: "category",
  memo: "memo",
  outflow: "outflow",
  inflow: "inflow",
  cleared: "cleared",
};

const features = tableFeatures({});
const column = createColumnHelper<typeof features, Transaction>();
const EMPTY: Transaction[] = [];
const NO_ROWS: ReadonlySet<string> = new Set();
/** The transactions' part of the bar when only scheduled rows are selected. */
const NO_SUMMARY = {
  count: 0,
  total: "0",
  currency: null,
  uncleared: 0,
  cleared: 0,
  reconciled: 0,
  reconciledTransfers: 0,
  categorizable: 0,
  unapproved: 0,
  splits: 0,
  splitsWithTransfers: 0,
  deletable: 0,
};
const ROW_HEIGHT = 41;
/** The least the Memo column gets; it takes whatever width the fixed columns leave beyond that. */
const MEMO_MIN_WIDTH = "9rem";

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
/** A saved transaction's version, and its transfer's other side's, by id. */
function versionsOf(row: Transaction): Record<string, number> {
  return {
    [row.id]: row.version,
    ...(row.transferSide ? { [row.transferSide.id]: row.transferSide.version } : {}),
  };
}

export function Register({
  accountId,
  focusId,
  search,
  onSearchChange,
  recordPayment,
  openRecordPayment = false,
  onRecordPaymentOpened,
}: {
  accountId?: string;
  focusId?: string;
  search: RegisterSearch;
  onSearchChange: (patch: Partial<RegisterSearch>, replace?: boolean) => void;
  /** A credit card's Record Payment: the new row it opens (YNAB's toolbar button). */
  recordPayment?: () => Draft;
  /** Open Record Payment's row now (the payment inspector's button, YNAB 2026-10-15). */
  openRecordPayment?: boolean;
  onRecordPaymentOpened?: () => void;
}) {
  const { budget, formatAmount, formatDate, readOnly } = useBudget();
  const history = useUndo();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useRegisterView(budget.id, accountId ?? "all");
  // Coming back to a register brings back its last search, unless we came to show one
  // transaction (the other side of a transfer opens unfiltered).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the register opens
  useEffect(() => {
    if (search.q !== undefined || focusId) return;
    const saved = savedSearch(budget.id, accountId ?? "all");
    if (saved) onSearchChange({ q: saved }, true);
  }, [budget.id, accountId]);
  const query = registerQuery(accountId, search, view);
  const today = todayIso();
  const transactions = useInfiniteQuery({
    queryKey: [...transactionsQueryPrefix, budget.id, query],
    queryFn: async ({ pageParam, signal }) => {
      // Not `$api.useInfiniteQuery`: it sends `cursor=0` for the first page.
      const { data, error } = await apiClient.GET("/v1/budgets/{budgetId}/transactions", {
        params: {
          path: { budgetId: budget.id },
          query: {
            ...query,
            // Entering what's come due first keeps the register current.
            today,
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
  // The Scheduled Transactions section: the same search and date range, by next date.
  const scheduledFilter = {
    ...(accountId ? { accountId } : {}),
    ...(query.q ? { q: query.q } : {}),
    ...rangeDates(view),
  };
  const scheduled = useQuery({
    queryKey: [...scheduledQueryPrefix, budget.id, scheduledFilter],
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET("/v1/budgets/{budgetId}/scheduled-transactions", {
        params: { path: { budgetId: budget.id }, query: { ...scheduledFilter, today } },
        signal,
      });
      if (error) throw error;
      return data.scheduledTransactions;
    },
    placeholderData: keepPreviousData,
  });
  const scheduledRows: readonly ScheduledTransaction[] = scheduled.data ?? [];
  const createScheduled = $api.useMutation("post", "/v1/budgets/{budgetId}/scheduled-transactions");
  const removeScheduled = $api.useMutation(
    "delete",
    "/v1/budgets/{budgetId}/scheduled-transactions/{scheduledTransactionId}",
  );
  // The section sits above the virtualized rows, so their offsets start below it.
  const [scheduledHeight, setScheduledHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const measureScheduled = useCallback((node: HTMLTableSectionElement | null) => {
    observer.current?.disconnect();
    if (!node) return;
    setScheduledHeight(node.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver(() => setScheduledHeight(node.offsetHeight));
    observer.current.observe(node);
  }, []);
  const loaded = useMemo(
    () => transactions.data?.pages.flatMap((p) => p.transactions) ?? EMPTY,
    [transactions.data],
  );
  const someHidden = transactions.data?.pages[0]?.someHidden ?? false;
  // YNAB hides its info column when no row in view needs approval or a category.
  const needsReview = useMemo(() => loaded.some((t) => !t.approved || t.needsCategory), [loaded]);
  // Rows read in the running balance's order only when the date comes first.
  const dateOrder = view.sort[0]?.column === "date";
  const accounts = useQuery(accountsQueryOptions(budget.id));
  // The budget starts the month before its oldest transaction (or before this month).
  const monthData = useQuery(monthQueryOptions(budget.id, currentMonth()));
  const oldestMonth = monthData.data ? addMonths(monthData.data.firstMonth, 1) : undefined;
  const categories = useQuery(categoriesQueryOptions(budget.id));
  const payees = useQuery(payeesQueryOptions(budget.id));
  const flagList = useQuery(flagsQueryOptions(budget.id));
  const renameFlagMutation = $api.useMutation("put", "/v1/budgets/{budgetId}/flags/{color}");
  const create = $api.useMutation("post", "/v1/budgets/{budgetId}/transactions");
  // Every edit's own version steps go into the undo history (EVERYCENT-36).
  const update = $api.useMutation("patch", "/v1/budgets/{budgetId}/transactions/{transactionId}", {
    onSuccess: (row) => history.noteSave(row.previousVersions, versionsOf(row)),
  });
  const remove = $api.useMutation("delete", "/v1/budgets/{budgetId}/transactions/{transactionId}");
  const matchTx = $api.useMutation("post", "/v1/budgets/{budgetId}/transactions/match");
  const unmatchTx = $api.useMutation(
    "post",
    "/v1/budgets/{budgetId}/transactions/{transactionId}/unmatch",
  );
  const [adding, setAdding] = useState(false);
  // What the new-transaction row starts with: empty, or Make Repeating's copy.
  const [addingDraft, setAddingDraft] = useState<Draft | null>(null);
  // Make Repeating opens the date picker on its row; Record Payment doesn't.
  const [addingPicker, setAddingPicker] = useState(false);
  const [addingKey, setAddingKey] = useState(0);
  const [newError, setNewError] = useState<string | null>(null);
  /** The transaction whose History dialog is open. */
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const session = useQuery(sessionQueryOptions);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  // The row whose Matched Transactions popover is open (EVERYCENT-68).
  const [matchFor, setMatchFor] = useState<string | null>(null);
  // The info column also shows while a matched row is edited: its link icon (EVERYCENT-68).
  const reviewing =
    needsReview || loaded.some((t) => t.matched && (t.id === editing?.id || t.id === matchFor));
  const [editingSplit, setEditingSplit] = useState<EditingSplit | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(NOTHING);
  /** A change waiting on YNAB's reconciled-transaction warning. */
  const [warning, setWarning] = useState<{
    warning: ReconciledWarning;
    proceed: () => void;
    cancel?: () => void;
  } | null>(null);
  const proceeding = useRef(false);
  const anchor = useRef<string | null>(null);
  const bulk = $api.useMutation("post", "/v1/budgets/{budgetId}/transactions/bulk", {
    onSuccess: (result) => history.noteSave(result.previousVersions, result.versions),
  });
  const scheduledBulk = $api.useMutation(
    "post",
    "/v1/budgets/{budgetId}/scheduled-transactions/bulk",
  );
  const updateScheduled = $api.useMutation(
    "patch",
    "/v1/budgets/{budgetId}/scheduled-transactions/{scheduledTransactionId}",
  );
  // Ticked scheduled rows (by row id); they join the action bar's selection.
  const [scheduledSelection, setScheduledSelection] = useState<ReadonlySet<string>>(NO_ROWS);
  const scheduledAnchor = useRef<string | null>(null);
  // A new search or filter is a new set of rows, so the selection starts over.
  const queryKey = JSON.stringify(query);
  const [selectionKey, setSelectionKey] = useState(queryKey);
  if (selectionKey !== queryKey) {
    setSelectionKey(queryKey);
    setSelection(NOTHING);
    setScheduledSelection(NO_ROWS);
    anchor.current = null;
  }

  const allAccounts = accountId === undefined;
  const columnIds = useMemo(
    () =>
      registerColumns(allAccounts).filter(
        (c) =>
          (c !== "balance" || view.showRunningBalance) &&
          (c !== "flag" || view.showFlags) &&
          (c !== "enteredBy" || view.showEnteredBy) &&
          // A viewer (EVERYCENT-88) can't select, approve or change rows.
          (c !== "select" || !readOnly) &&
          (c !== "review" || (reviewing && !readOnly)),
      ),
    [allAccounts, view.showRunningBalance, view.showFlags, view.showEnteredBy, reviewing, readOnly],
  );
  const accountList = accounts.data?.accounts ?? [];
  const accountById = useMemo(() => new Map(accountList.map((a) => [a.id, a])), [accountList]);
  /** An amount in `currency` (a row's, or its account's): the budget's by default. */
  const show = (amount: bigint, currency?: string) =>
    formatAmount(money(amount, inCurrency(budget, currency).currency));
  /** The budget's number format with account `id`'s currency, for its amounts. */
  const settingsOf = (id: string | undefined) =>
    inCurrency(budget, id ? accountById.get(id)?.currency : undefined);
  /** A transfer to an account in another currency: the money settings in that one's currency. */
  const otherSettingsOf = (draft: Pick<Draft, "accountId" | "transferAccountId">) => {
    const own = accountById.get(draft.accountId)?.currency;
    const other = draft.transferAccountId
      ? accountById.get(draft.transferAccountId)?.currency
      : undefined;
    return own && other && own !== other
      ? settingsOf(draft.transferAccountId ?? undefined)
      : undefined;
  };
  /**
   * A foreign-currency amount with what the plan counts under it, in the budget's currency
   * (EVERYCENT-54), and its rate on hover.
   */
  const withBase = (
    native: string,
    t: { currency: string; baseAmount: string; fxRate: string | null },
  ) => {
    if (t.currency === budget.currency) return native;
    const base = BigInt(t.baseAmount);
    return (
      <span
        className="inline-flex flex-col items-end leading-tight"
        title={t.fxRate ? `1 ${t.currency} = ${t.fxRate} ${budget.currency}` : undefined}
      >
        <span>
          {native}
          {/* All accounts mixes currencies: name the row's, which a symbol may not (EVERYCENT-193). */}
          {!accountId && <span className="ml-1 text-muted-foreground text-xs">{t.currency}</span>}
        </span>
        <span className="text-muted-foreground text-xs">{show(base < 0n ? -base : base)}</span>
      </span>
    );
  };
  /** The currency of the register's own account (the budget's for all accounts). */
  const registerSettings = settingsOf(accountId);
  /** A new transaction in `id`, starting cleared in a cash account (YNAB). */
  const newDraft = (id: string, date: string) => emptyDraft(id, date, accountById.get(id)?.type);
  const openAccounts = accountList.filter((a) => !a.closed);
  const account = accountId ? accountById.get(accountId) : undefined;
  const options = useMemo(
    () => (categories.data ? categoryOptions(categories.data) : []),
    [categories.data],
  );
  const payeeList = payees.data?.payees ?? [];
  const flags = flagList.data?.flags ?? [];
  const searchSources = useMemo(
    () => ({ categories: options, accounts: accountList, flags, settings: registerSettings }),
    [options, accountList, flags, registerSettings],
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
  // Split lines sit right under their transaction (read-only; the split is edited as a whole),
  // unless it's folded away.
  const [collapsedSplits, toggleSplit] = useCollapsedSplits();
  const flat = useMemo(
    () =>
      rows.flatMap(({ original: t }): Item[] => [
        { kind: "transaction", key: t.id, t },
        // Under a search, YNAB shows only the lines that match it, folded or not.
        ...t.subtransactions
          .filter((line) =>
            t.matchingLineIds === null
              ? !collapsedSplits[t.id]
              : t.matchingLineIds.includes(line.id),
          )
          .map((line): Item => ({ kind: "line", key: `${t.id}:${line.id}`, t, line })),
      ]),
    [rows, collapsedSplits],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => flat[index]?.key ?? index,
    overscan: 12,
    scrollMargin: scheduledHeight,
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
  // The selection's filter is the register's, without the sort, and with the list's today so a
  // year-less `Income:` matches the same rows.
  const { sort: _sort, hideReconciled, ...rest } = query;
  const selectionFilter = {
    ...rest,
    today,
    ...(hideReconciled ? { hideReconciled: true } : {}),
  };
  const summary = $api.useQuery(
    "post",
    "/v1/budgets/{budgetId}/transactions/selection",
    {
      params: { path: { budgetId: budget.id } },
      body: { selection: selectionBody(selection, selectionFilter) },
    },
    { enabled: !isEmpty(selection) },
  );

  // The bar's figures: the selected transactions (none when only scheduled rows are ticked) plus
  // the selected scheduled rows.
  const selectionSummary = isEmpty(selection) ? NO_SUMMARY : summary.data;
  const selectedScheduled = scheduledRows.filter((row) => scheduledSelection.has(row.id));
  const scheduledTotal = selectedScheduled.reduce((sum, row) => sum + BigInt(row.amount), 0n);
  // Amounts in different currencies don't add up, so a mixed selection shows no total
  // (converted totals: EVERYCENT-57).
  const selectedCurrencies = new Set<string | null>(selectedScheduled.map((row) => row.currency));
  if (selectionSummary && selectionSummary.count > 0) {
    selectedCurrencies.add(selectionSummary.currency);
  }
  const mixedCurrencies = selectedCurrencies.size > 1 || selectedCurrencies.has(null);
  const [selectionCurrency] = selectedCurrencies;
  // Make Repeating is offered for exactly one plain transaction.
  const single =
    selection.mode === "some" && selection.ids.size === 1 && scheduledSelection.size === 0
      ? loaded.find((t) => selection.ids.has(t.id))
      : undefined;
  const repeatable = single && !single.transferFromSplit ? single : undefined;

  function toggleRow(id: string, on: boolean, shift: boolean) {
    const ids = shift ? rangeTo(loadedIds, anchor.current, id) : [id];
    anchor.current = id;
    setSelection((s) => setSelected(s, ids, on));
  }

  function toggleScheduled(id: string, on: boolean, shift: boolean) {
    const order = scheduledRows.map((row) => row.id);
    const ids = shift ? rangeTo(order, scheduledAnchor.current, id) : [id];
    scheduledAnchor.current = id;
    setScheduledSelection((current) => {
      const next = new Set(current);
      for (const rowId of ids) on ? next.add(rowId) : next.delete(rowId);
      return next;
    });
  }

  function clearSelection() {
    setSelection(NOTHING);
    setScheduledSelection(NO_ROWS);
  }
  /**
   * YNAB's Match (2026-10-17, EVERYCENT-68): one imported transaction that isn't matched yet and
   * one entered transaction in the same account. Null when the selection isn't such a pair.
   */
  const pickedRows =
    selection.mode === "some" && scheduledSelection.size === 0
      ? loaded.filter((t) => selection.ids.has(t.id))
      : [];
  const allPickedLoaded = selection.mode === "some" && pickedRows.length === selection.ids.size;
  const matchPair = (() => {
    if (!allPickedLoaded || pickedRows.length !== 2) return null;
    const imported = pickedRows.find((t) => t.imported && !t.matched);
    const entered = pickedRows.find((t) => !t.imported && !t.matched);
    if (!imported || !entered || imported.accountId !== entered.accountId) return null;
    if (entered.cleared === "reconciled") return null;
    return { imported, entered };
  })();
  const unmatchable =
    allPickedLoaded && pickedRows.length > 0 && pickedRows.every((t) => t.matched !== null);

  async function runMatch(importedId: string, enteredId: string) {
    await matchTx.mutateAsync({
      params: { path: { budgetId: budget.id } },
      body: { transactionIds: [importedId, enteredId] },
    });
  }
  async function runUnmatch(id: string) {
    const done = await unmatchTx.mutateAsync({
      params: { path: { budgetId: budget.id, transactionId: id } },
    });
    return done.importedTransactionId;
  }

  async function matchSelected() {
    if (!matchPair) return;
    const enteredId = matchPair.entered.id;
    let importedId = matchPair.imported.id;
    try {
      await runMatch(importedId, enteredId);
      history.record({
        label: "matched transactions",
        undo: async () => {
          importedId = await runUnmatch(enteredId);
          await refresh();
        },
        redo: async () => {
          await runMatch(importedId, enteredId);
          await refresh();
        },
      });
      clearSelection();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't match these transactions");
    }
  }

  async function unmatchRows(ids: readonly string[]) {
    const pairs: { enteredId: string; importedId: string }[] = [];
    try {
      for (const id of ids) pairs.push({ enteredId: id, importedId: await runUnmatch(id) });
      history.record({
        label: ids.length === 1 ? "unmatched transaction" : "unmatched transactions",
        undo: async () => {
          for (const p of pairs) await runMatch(p.importedId, p.enteredId);
          await refresh();
        },
        redo: async () => {
          for (const p of pairs) p.importedId = await runUnmatch(p.enteredId);
          await refresh();
        },
      });
      clearSelection();
      setEditing(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't unmatch");
      await refresh();
    }
  }

  /** Bulk actions; deleting reconciled transactions (or their transfers) asks first. */
  function requestBulk(action: BulkAction) {
    const found =
      action.type === "delete" && summary.data && !isEmpty(selection)
        ? deleteWarning(summary.data)
        : null;
    if (found) setWarning({ warning: found, proceed: () => void applyBulk(action) });
    else void applyBulk(action);
  }

  /**
   * One action on the selected transactions and scheduled rows, undone as one. Duplicate selects
   * the copies and Enter Now the entered transactions, as YNAB does.
   */
  async function applyBulk(action: BulkAction) {
    try {
      const commands: Omit<UndoCommand, "label">[] = [];
      let count = 0;
      let nextSelection: Selection = NOTHING;
      let nextScheduled: ReadonlySet<string> = NO_ROWS;
      if (!isEmpty(selection) && action.type !== "enterNow") {
        const run = () =>
          bulk.mutateAsync({
            params: { path: { budgetId: budget.id } },
            body: { selection: selectionBody(selection, selectionFilter), action },
          });
        const result = await run();
        count += result.updated;
        if (action.type === "duplicate") {
          commands.push(duplicateCommand(async () => (await run()).created, result.created));
          // Every copy row whose original was ticked: both sides of a transfer ticked from both.
          nextSelection = { mode: "some", ids: new Set(result.copies) };
        } else if (result.updated > 0) {
          commands.push(bulkCommand(action, result.before, result.versions));
        }
      }
      if (
        scheduledSelection.size > 0 &&
        action.type !== "cleared" &&
        action.type !== "approve" &&
        action.type !== "reject"
      ) {
        const ids = [...scheduledSelection];
        const result = await scheduledBulk.mutateAsync({
          params: { path: { budgetId: budget.id } },
          body: { ids, action, today },
        });
        count += result.updated;
        if (result.updated > 0) commands.push(scheduledCommand(action, ids, result));
        if (action.type === "duplicate") nextScheduled = new Set(result.created);
        if (action.type === "enterNow") {
          nextSelection = { mode: "some", ids: new Set(result.entered) };
        }
      }
      if (commands.length > 0) {
        history.record({
          label: `${action.type} ${count} transaction${count === 1 ? "" : "s"}`,
          // The ticked rows may be gone (copies, entered transactions), so the selection clears.
          undo: async () => {
            for (const command of [...commands].reverse()) await command.undo();
            clearSelection();
            await refresh();
          },
          redo: async () => {
            for (const command of commands) await command.redo();
            clearSelection();
            await refresh();
          },
        });
      }
      await refresh();
      setSelection(nextSelection);
      setScheduledSelection(nextScheduled);
      const n = `${count} transaction${count === 1 ? "" : "s"}`;
      toast.success(
        action.type === "delete"
          ? `Deleted ${n}`
          : action.type === "approve"
            ? `Approved ${n}`
            : action.type === "reject"
              ? `Rejected ${n}`
              : action.type === "move"
                ? `Moved ${n}`
                : action.type === "duplicate"
                  ? `Duplicated ${n}`
                  : action.type === "enterNow"
                    ? `Entered ${n}`
                    : `Updated ${n}`,
      );
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't update the selected transactions."));
    }
  }

  /** Undo for duplicated transactions: delete the copies; redo copies the originals again. */
  function duplicateCommand(rerun: () => Promise<string[]>, created: string[]) {
    let current = created;
    return {
      undo: async () => {
        for (const transactionId of current) {
          await remove.mutateAsync({ params: { path: { budgetId: budget.id, transactionId } } });
        }
      },
      redo: async () => {
        current = await rerun();
      },
    };
  }

  /**
   * Undo for a bulk action on scheduled rows: schedules are put back exactly (first date
   * included) from `before`; copies and entered transactions are deleted.
   */
  function scheduledCommand(
    action: Exclude<BulkAction, { type: "cleared" | "approve" | "reject" }>,
    ids: string[],
    result: { before: ScheduledTransaction[]; entered: string[]; created: string[] },
  ) {
    const path = { budgetId: budget.id };
    let entered = result.entered;
    let created = result.created;
    // Schedules as they are now: deleted (or finished one-off) ones are gone.
    let current: (string | null)[] = result.before.map((b) =>
      action.type === "delete" || (action.type === "enterNow" && b.frequency === "never")
        ? null
        : b.id,
    );
    let redoIds = ids;
    return {
      undo: async () => {
        const restored: (string | null)[] = [];
        for (const [index, before] of result.before.entries()) {
          const body = { ...scheduleRestoreBody(before), today };
          const id = current[index];
          if (action.type === "duplicate") {
            restored.push(id ?? null);
            continue;
          }
          if (id) {
            await updateScheduled.mutateAsync({
              params: { path: { ...path, scheduledTransactionId: id } },
              body,
            });
            restored.push(id);
          } else {
            const again = await createScheduled.mutateAsync({ params: { path }, body });
            restored.push(again.scheduledTransaction?.id ?? null);
          }
        }
        current = restored;
        for (const transactionId of entered) {
          await remove.mutateAsync({ params: { path: { ...path, transactionId } } });
        }
        for (const scheduledTransactionId of created) {
          await removeScheduled.mutateAsync({
            params: { path: { ...path, scheduledTransactionId } },
          });
        }
        // Recreated schedules have new ids; the redo acts on what's there now.
        if (action.type === "delete" || action.type === "enterNow") {
          redoIds = current.filter((id): id is string => id !== null);
        }
      },
      redo: async () => {
        if (redoIds.length === 0) return;
        const again = await scheduledBulk.mutateAsync({
          params: { path },
          body: { ids: redoIds, action, today },
        });
        entered = again.entered;
        created = again.created;
        if (action.type === "delete") current = current.map(() => null);
        if (action.type === "enterNow") {
          current = result.before.map((b, i) =>
            b.frequency === "never" ? null : (current[i] ?? null),
          );
        }
      },
    };
  }

  // Item offsets count from the top of the Scheduled section (`scrollMargin`); the total doesn't.
  const lastEnd = items.at(-1)?.end;
  const paddingTop = (items[0]?.start ?? scheduledHeight) - scheduledHeight;
  const paddingBottom =
    lastEnd === undefined ? 0 : virtualizer.getTotalSize() + scheduledHeight - lastEnd;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: transactionsQueryPrefix }),
      queryClient.invalidateQueries({ queryKey: scheduledQueryPrefix }),
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

  /** Undo for a bulk action on transactions, from their state before it. */
  function bulkCommand(
    action: Exclude<BulkAction, { type: "enterNow" }>,
    before: Transaction[],
    after: Record<string, number>,
  ) {
    let current = before;
    /** The version this command last left each row at; undo and redo follow the tab's steps. */
    let left = after;
    // Reject deletes the unapproved rows, so it's undone like a delete.
    const deletes = action.type === "delete" || action.type === "reject";
    return {
      undo: async () => {
        if (deletes) {
          const restored: Transaction[] = [];
          for (const transaction of before) {
            restored.push(
              await create.mutateAsync({
                params: { path: { budgetId: budget.id }, query: { today: todayIso() } },
                body: createBodyFromTransaction(transaction),
              }),
            );
          }
          current = restored;
        } else {
          const undone: Record<string, number> = {};
          for (const transaction of before) {
            // Followed each time: putting one side of a transfer back moves the other's too.
            const from = left[transaction.id] ?? transaction.version;
            const saved = await update.mutateAsync({
              params: {
                path: { budgetId: budget.id, transactionId: transaction.id },
                query: { today: todayIso() },
              },
              body: {
                ...updateBodyFromTransaction(transaction),
                expectedVersion: history.expectedVersion(transaction.id, from),
              },
            });
            Object.assign(undone, versionsOf(saved));
          }
          left = undone;
          current = before;
        }
      },
      redo: async () => {
        if (deletes) {
          for (const transaction of current) {
            await remove.mutateAsync({
              params: {
                path: { budgetId: budget.id, transactionId: transaction.id },
                query: { expectedVersion: transaction.version },
              },
            });
          }
        } else if (action.type !== "duplicate") {
          const ids = current.map((transaction) => transaction.id);
          const result = await bulk.mutateAsync({
            params: { path: { budgetId: budget.id } },
            body: {
              selection: { ids },
              action,
              expectedVersions: Object.fromEntries(
                ids.flatMap((id) => {
                  const from = left[id];
                  return from === undefined ? [] : [[id, history.expectedVersion(id, from)]];
                }),
              ),
            },
          });
          left = result.versions;
        }
      },
    };
  }

  /**
   * Undo for a single edit: puts the row back as it was, unless a partner changed it since
   * (`expectedVersion`; the API refuses with STALE_VERSION, EVERYCENT-36).
   */
  function recordUpdate(label: string, before: Transaction, after: Transaction) {
    // The version this command last left the row at; the tab's own steps lead on from it.
    let left = after.version;
    const replay = async (row: Transaction) => {
      const saved = await update.mutateAsync({
        params: {
          path: { budgetId: budget.id, transactionId: row.id },
          query: { today: todayIso() },
        },
        body: {
          ...updateBodyFromTransaction(row),
          expectedVersion: history.expectedVersion(row.id, left),
        },
      });
      left = saved.version;
      await refresh();
    };
    history.record({ label, undo: () => replay(before), redo: () => replay(after) });
  }

  /** A transfer's payee as YNAB's register words it ("Payment: X" / "Transfer: X"). */
  function rowPayee(
    accountId: string,
    transferAccountId: string | null,
    amount: bigint,
    stored: string | null,
  ) {
    const own = accountById.get(accountId);
    const other = transferAccountId ? accountById.get(transferAccountId) : undefined;
    return own && other ? transferRowLabel(own.type, other, amount) : stored;
  }

  /**
   * An in-budget transfer's category cell: "Credit Card Payments: <card>" between a card and a
   * cash account (`paymentCategoryCard`), otherwise nothing.
   */
  function transferCategory(accountId: string, transferAccountId: string | null) {
    const own = accountById.get(accountId);
    const other = transferAccountId ? accountById.get(transferAccountId) : undefined;
    const card = own && other ? paymentCategoryCard(own, other) : null;
    if (!card?.paymentCategoryId) return "";
    const group = categories.data?.groups.find((g) =>
      g.categories.some((c) => c.id === card.paymentCategoryId),
    );
    const category = group?.categories.find((c) => c.id === card.paymentCategoryId);
    return group && category ? `${group.name}: ${category.name}` : "";
  }

  /** Whether `t` has a category: not in tracking accounts, nor on in-budget transfers. */
  function hasCategory(t: Transaction) {
    const type = accountById.get(t.accountId)?.type ?? "checking";
    const transferType = t.transferAccountId ? accountById.get(t.transferAccountId)?.type : null;
    return usesCategory(type, transferType);
  }

  /** A saved row's category cell; "Category not needed" in muted text as YNAB shows it. */
  function rowCategory(t: Transaction): ReactNode {
    const notNeeded = categoryNotNeeded({
      accountType: accountById.get(t.accountId)?.type ?? "checking",
      transferAccountType: t.transferAccountId
        ? (accountById.get(t.transferAccountId)?.type ?? null)
        : null,
      payeeName: t.payeeName,
    });
    if (!notNeeded) return t.categoryName;
    return (
      transferCategory(t.accountId, t.transferAccountId) || (
        <span className="text-muted-foreground">Category not needed</span>
      )
    );
  }

  /**
   * The cells of `t` that can be edited, in Tab order. A split's transfer side only takes its
   * memo and category; the split owns the rest.
   */
  function editableColumns(t: Transaction): CellColumn[] {
    if (readOnly) return [];
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
    const draft = draftFrom(t, inCurrency(budget, t.currency));
    setEditing(null);
    setAdding(false);
    setSplitError(null);
    setEditingSplit({ id: t.id, draft: split ? startSplit(draft) : draft });
  }

  async function saveSplit(t: Transaction, draft: Draft, confirmed = false) {
    if (!draft.date) return setSplitError("Enter a date.");
    const result = updateBody(t, draft, settingsOf(draft.accountId), otherSettingsOf(draft));
    if (!result.ok) return setSplitError(result.error);
    if (draft.date > today) {
      if (await reschedule(t, draft)) setEditingSplit(null);
      return;
    }
    const found = confirmed ? null : editWarning(t, result.body, accountName);
    if (found) {
      setWarning({ warning: found, proceed: () => void saveSplit(t, draft, true) });
      return;
    }
    try {
      if (Object.keys(result.body).length > 0) {
        const after = await update.mutateAsync({
          params: {
            path: { budgetId: budget.id, transactionId: t.id },
            query: { today: todayIso() },
          },
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

  /** Opens the new-transaction row: empty, or with a draft (Make Repeating's, Record Payment's). */
  function startAdding(draft: Draft | null = null, openPicker = draft !== null) {
    setEditing(null);
    setEditingSplit(null);
    setNewError(null);
    setAddingDraft(draft);
    setAddingPicker(openPicker);
    setAddingKey((k) => k + 1);
    setAdding(true);
  }

  /**
   * YNAB's Make Repeating: a new scheduled row prefilled from `t`, a month later and repeating
   * monthly; saving it creates the schedule and leaves `t` as it is.
   */
  function makeRepeating(t: Transaction) {
    clearSelection();
    startAdding(makeRepeatingDraft(t, inCurrency(budget, t.currency)));
  }

  /**
   * After a save: close the new row, or (YNAB's "Save and add another") open a fresh one that
   * keeps the date, in the register's own account (2026-10-15).
   */
  function afterNewSaved(draft: Draft, another: boolean) {
    if (another && defaultAccountId) startAdding(newDraft(defaultAccountId, draft.date), false);
    else setAdding(false);
  }

  async function saveNew(draft: Draft, another = false) {
    if (!draft.date) return setNewError("Enter a date.");
    if (isScheduled(draft, today)) return saveNewScheduled(draft, another);
    const result = createBody(draft, settingsOf(draft.accountId), otherSettingsOf(draft));
    if (!result.ok) return setNewError(result.error);
    const fee = result.body.fee;
    try {
      const created = await create.mutateAsync({
        params: { path: { budgetId: budget.id }, query: { today: todayIso() } },
        body: result.body,
      });
      let current = created;
      history.record({
        label: "new transaction",
        undo: async () => {
          await remove.mutateAsync({
            params: {
              path: { budgetId: budget.id, transactionId: current.id },
              query: { expectedVersion: history.expectedVersion(current.id, current.version) },
            },
          });
          // A transfer's fee is a transaction of its own; it goes with the transfer it came with.
          const feeId = current.feeTransactionId;
          if (feeId) {
            await remove.mutateAsync({
              params: { path: { budgetId: budget.id, transactionId: feeId } },
            });
          }
          await refresh();
        },
        redo: async () => {
          current = await create.mutateAsync({
            params: { path: { budgetId: budget.id }, query: { today: todayIso() } },
            body: { ...createBodyFromTransaction(created), ...(fee ? { fee } : {}) },
          });
          await refresh();
        },
      });
      afterNewSaved(draft, another);
      await refresh();
    } catch (e) {
      setNewError(apiErrorMessage(e, "Couldn't save the transaction."));
    }
  }

  /**
   * A new transaction that repeats or is dated ahead is a scheduled one (YNAB). A past date with
   * a repeat enters that one transaction and starts the schedule after today.
   */
  async function saveNewScheduled(draft: Draft, another = false) {
    const result = scheduleCreateBody(draft, settingsOf(draft.accountId), today);
    if (!result.ok) return setNewError(result.error);
    try {
      const body = result.body;
      let written = await createScheduled.mutateAsync({
        params: { path: { budgetId: budget.id } },
        body,
      });
      history.record({
        label: "new scheduled transaction",
        undo: async () => {
          if (written.scheduledTransaction) {
            await removeScheduled.mutateAsync({
              params: {
                path: {
                  budgetId: budget.id,
                  scheduledTransactionId: written.scheduledTransaction.id,
                },
              },
            });
          }
          if (written.enteredTransactionId) {
            await remove.mutateAsync({
              params: {
                path: { budgetId: budget.id, transactionId: written.enteredTransactionId },
              },
            });
          }
          await refresh();
        },
        redo: async () => {
          written = await createScheduled.mutateAsync({
            params: { path: { budgetId: budget.id } },
            body,
          });
          await refresh();
        },
      });
      afterNewSaved(draft, another);
      await refresh();
    } catch (e) {
      setNewError(apiErrorMessage(e, "Couldn't save the transaction."));
    }
  }

  /**
   * Moving a transaction's date into the future makes it a scheduled transaction (YNAB), its
   * transfer's other side included. Undo brings the transaction back.
   */
  async function reschedule(t: Transaction, draft: Draft) {
    const result = rescheduleBody(t, draft, settingsOf(draft.accountId), today);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    try {
      let written = await createScheduled.mutateAsync({
        params: { path: { budgetId: budget.id } },
        body: result.body,
      });
      let restored: Transaction | null = null;
      history.record({
        label: "scheduled transaction",
        undo: async () => {
          // The transaction first: if it can't come back, the schedule stays.
          restored = await create.mutateAsync({
            params: { path: { budgetId: budget.id }, query: { today: todayIso() } },
            body: createBodyFromTransaction(t),
          });
          const id = written.scheduledTransaction?.id;
          if (id) {
            await removeScheduled.mutateAsync({
              params: { path: { budgetId: budget.id, scheduledTransactionId: id } },
            });
          }
          await refresh();
        },
        redo: async () => {
          if (!restored) return;
          written = await createScheduled.mutateAsync({
            params: { path: { budgetId: budget.id } },
            body: { ...result.body, fromTransactionId: restored.id },
          });
          await refresh();
        },
      });
      await refresh();
      toast.success("Moved to Scheduled Transactions");
      return true;
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't schedule the transaction."));
      return false;
    }
  }

  /**
   * Tab off the row's last editable cell (Shift+Tab off its first) goes on to the row's next control
   * (the Cleared button; the flag going back), as the browser would have: the closing editor took
   * the focus with it, which otherwise lands on the page and costs an extra Tab.
   */
  function focusPast(id: string, cell: CellColumn, exit: "next" | "previous") {
    requestAnimationFrame(() => {
      const row = document.querySelector(`tr[data-transaction-id="${id}"]`);
      if (!row) return;
      const at = columnIds.indexOf(cell);
      const cells = [...row.children];
      const beyond = exit === "next" ? cells.slice(at + 1) : cells.slice(0, at).reverse();
      for (const td of beyond) {
        const controls = [
          ...td.querySelectorAll<HTMLElement>("button, input, select, a[href], [tabindex]"),
        ].filter((el) => el.tabIndex >= 0 && !el.hasAttribute("disabled"));
        const target = exit === "next" ? controls[0] : controls.at(-1);
        if (target) {
          target.focus();
          return;
        }
      }
    });
  }

  async function commitCell(
    t: Transaction,
    cell: CellColumn,
    value: string | null,
    exit: CellExit,
    transferAccountId: string | null,
  ) {
    const result = cellUpdate(t, cell, value, inCurrency(budget, t.currency), transferAccountId);
    if (!result.ok) {
      toast.error(result.error);
      setEditing({ id: t.id, column: cell });
      return;
    }
    if (result.body.date && result.body.date > today) {
      setEditing(null);
      await reschedule(t, {
        ...draftFrom(t, inCurrency(budget, t.currency)),
        date: result.body.date,
      });
      return;
    }
    const order = editableColumns(t);
    const next = order[order.indexOf(cell) + (exit === "next" ? 1 : -1)];
    setEditing(exit !== "stay" && next ? { id: t.id, column: next } : null);
    if (exit !== "stay" && !next) focusPast(t.id, cell, exit);
    if (Object.keys(result.body).length === 0) return;
    const save = async () => {
      try {
        const after = await update.mutateAsync({
          params: {
            path: { budgetId: budget.id, transactionId: t.id },
            query: { today: todayIso() },
          },
          body: result.body,
        });
        recordUpdate("transaction edit", t, after);
        await refresh();
      } catch (e) {
        toast.error(apiErrorMessage(e, "Couldn't save the change."));
      }
    };
    const found = editWarning(t, result.body, accountName);
    if (!found) return save();
    setEditing(null);
    setWarning({
      warning: found,
      proceed: () => void save(),
      // Back to the cell, as YNAB leaves the row open on Cancel.
      cancel: () => setEditing({ id: t.id, column: cell }),
    });
  }

  function accountName(id: string) {
    return accountById.get(id)?.name ?? "the other account";
  }

  async function setFlag(t: Transaction, flag: FlagColor | null) {
    try {
      const after = await update.mutateAsync({
        params: {
          path: { budgetId: budget.id, transactionId: t.id },
          query: { today: todayIso() },
        },
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
        params: {
          path: { budgetId: budget.id, transactionId: t.id },
          query: { today: todayIso() },
        },
        body: { cleared: t.cleared === "uncleared" ? "cleared" : "uncleared" },
      });
      recordUpdate("transaction cleared state", t, after);
      await refresh();
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't update the transaction."));
    }
  }

  /** YNAB's Approve on one row; undone as an edit (a transfer's other side follows). */
  async function approveRow(t: Transaction) {
    try {
      const after = await update.mutateAsync({
        params: {
          path: { budgetId: budget.id, transactionId: t.id },
          query: { today: todayIso() },
        },
        body: { approved: true },
      });
      recordUpdate("approved transaction", t, after);
      await refresh();
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't approve the transaction."));
    }
  }

  function handleDelete(t: Transaction) {
    const found = deleteWarning(rowDeleteScope(t));
    if (found) setWarning({ warning: found, proceed: () => void deleteRow(t) });
    else void deleteRow(t);
  }

  /** Delete, or YNAB's Reject (which deletes an unapproved transaction it didn't import). */
  async function deleteRow(t: Transaction, reject = false) {
    try {
      await remove.mutateAsync({
        params: { path: { budgetId: budget.id, transactionId: t.id } },
      });
      let current: Transaction | null = null;
      history.record({
        label: reject ? "rejected transaction" : "deleted transaction",
        undo: async () => {
          current = await create.mutateAsync({
            params: { path: { budgetId: budget.id }, query: { today: todayIso() } },
            body: createBodyFromTransaction(t),
          });
          await refresh();
        },
        redo: async () => {
          if (!current) return;
          await remove.mutateAsync({
            params: {
              path: { budgetId: budget.id, transactionId: current.id },
              query: { expectedVersion: history.expectedVersion(current.id, current.version) },
            },
          });
          await refresh();
        },
      });
      await refresh();
      const transfers = t.transferAccountId || t.subtransactions.some((l) => l.transferAccountId);
      toast.success(
        reject
          ? "Transaction rejected"
          : transfers
            ? "Deleted, with its transfers"
            : "Transaction deleted",
      );
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't delete the transaction."));
    }
  }

  const defaultAccountId = accountId ?? openAccounts[0]?.id;
  const canAdd = defaultAccountId !== undefined && (allAccounts || account?.closed === false);

  // Arriving from the payment inspector's Record Payment opens the same row the toolbar does.
  const startPayment = recordPayment && canAdd && openRecordPayment ? recordPayment : null;
  const paymentOpened = useRef(false);
  useEffect(() => {
    if (!openRecordPayment) paymentOpened.current = false;
    if (!startPayment || paymentOpened.current) return;
    // Once per arrival; the route then drops `openRecordPayment` from the URL.
    paymentOpened.current = true;
    startAdding(startPayment(), false);
    onRecordPaymentOpened?.();
    // biome-ignore lint/correctness/useExhaustiveDependencies: startAdding is a plain function
  }, [openRecordPayment, startPayment, onRecordPaymentOpened]);

  if (transactions.isPending) return <Skeleton className="h-64" />;
  if (transactions.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {apiErrorMessage(transactions.error, "Couldn't load the transactions.")}
      </p>
    );
  }
  const q = searchText(search);
  const [first]: readonly SortField[] = view.sort.length > 0 ? view.sort : DEFAULT_SORT;
  const sort = first?.column;
  const dir = first?.dir;

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
      case "review":
        return (
          <ReviewCell
            approved={t.approved}
            needsCategory={t.needsCategory}
            pending={update.isPending || remove.isPending}
            onApprove={() => void approveRow(t)}
            onReject={() => void deleteRow(t, true)}
            onCategorize={
              editableColumns(t).includes("category")
                ? () => setEditing({ id: t.id, column: "category" })
                : undefined
            }
            match={
              t.matched && (editing?.id === t.id || matchFor === t.id)
                ? {
                    onHold: (held) => setMatchFor(held ? t.id : null),
                    rows: [
                      {
                        date: formatDate(t.date),
                        payee: t.payeeName ?? "",
                        memo: t.memo,
                        amount: show(BigInt(t.amount), t.currency),
                      },
                      {
                        date: formatDate(t.matched.date),
                        payee: t.matched.payee,
                        memo: t.matched.memo,
                        amount: show(BigInt(t.matched.amount), t.currency),
                      },
                    ],
                    onUnmatch: () => {
                      setMatchFor(null);
                      void unmatchRows([t.id]);
                    },
                  }
                : undefined
            }
          />
        );
      case "flag":
        if (readOnly) {
          const current = flags.find((f) => f.color === t.flag);
          return current ? (
            <Bookmark
              className={cn("mx-auto size-4 fill-current", FLAG_CLASS[current.color])}
              aria-label={`Flag: ${flagLabel(current)}`}
            />
          ) : null;
        }
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
            <span className="truncate">
              {rowPayee(t.accountId, t.transferAccountId, amount, t.payeeName)}
            </span>
          </span>
        ) : (
          t.payeeName
        );
      case "category":
        if (t.subtransactions.length > 0) {
          const count = new Set(t.subtransactions.map((l) => l.categoryId ?? l.transferAccountId))
            .size;
          const folded = Boolean(collapsedSplits[t.id]);
          return (
            <span className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="-ml-1 shrink-0"
                aria-expanded={!folded}
                aria-label={folded ? "Show split lines" : "Hide split lines"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSplit(t.id);
                }}
              >
                <ChevronRight className={cn("transition-transform", !folded && "rotate-90")} />
              </Button>
              <Split className="size-4 shrink-0" />
              <span className="truncate">
                Split ({count} {count === 1 ? "category" : "categories"})
              </span>
            </span>
          );
        }
        if (t.needsCategory) return <NeedsCategoryPill />;
        return rowCategory(t);
      case "memo":
        return t.memo;
      case "outflow":
      case "inflow": {
        // An FX revaluation has no native amount: its side is its base amount's (EVERYCENT-56).
        const sign = amount === 0n ? BigInt(t.baseAmount) : amount;
        if (id === "outflow" ? sign >= 0n : sign <= 0n) return "";
        return withBase(show(amount < 0n ? -amount : amount, t.currency), t);
      }
      case "balance": {
        const balance = BigInt(t.runningBalance);
        return (
          <span className={cn(balance < 0n && "text-destructive")}>
            {show(balance, t.currency)}
          </span>
        );
      }
      case "enteredBy":
        // Nothing for rows nobody entered (scheduled) or from before this was recorded.
        return t.enteredBy ? (
          <MemberAvatar
            className="mx-auto"
            userId={t.enteredBy.userId}
            userName={t.enteredBy.name}
            avatarColor={t.enteredBy.avatarColor}
            currentUserId={session.data?.user.id}
            tooltipPrefix="Entered by "
            tooltipSuffix={t.changedBy?.name ? `, last changed by ${t.changedBy.name}` : ""}
          />
        ) : null;
      case "cleared":
        if (readOnly && t.cleared !== "reconciled") {
          return t.cleared === "cleared" ? (
            <CircleCheck className="mx-auto size-4 text-primary" aria-label="Cleared" />
          ) : (
            <Circle className="mx-auto size-4 text-muted-foreground" aria-label="Uncleared" />
          );
        }
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
              {readOnly ? (
                <DropdownMenuItem onSelect={() => setHistoryFor(t.id)}>
                  <History /> History
                </DropdownMenuItem>
              ) : (
                <>
                  {!t.approved && (
                    <>
                      <DropdownMenuItem onSelect={() => void approveRow(t)}>
                        <Check /> Approve
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void deleteRow(t, true)}>
                        <CircleX /> Reject
                      </DropdownMenuItem>
                    </>
                  )}
                  {hasCategory(t) && !t.transferFromSplit && t.subtransactions.length === 0 && (
                    <DropdownMenuItem onSelect={() => openSplit(t, true)}>
                      <Split /> Split
                    </DropdownMenuItem>
                  )}
                  {!t.transferFromSplit && (
                    <DropdownMenuItem onSelect={() => makeRepeating(t)}>
                      <Repeat /> Make Repeating
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => setHistoryFor(t.id)}>
                    <History /> History
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={t.transferFromSplit}
                    onSelect={() => handleDelete(t)}
                  >
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </>
              )}
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
            <span className="truncate">
              {rowPayee(t.accountId, line.transferAccountId, amount, line.payeeName)}
            </span>
          </span>
        );
      case "category": {
        const type = accountById.get(t.accountId)?.type ?? "checking";
        const to = line.transferAccountId ? accountById.get(line.transferAccountId)?.type : null;
        if (!usesCategory(type, to)) return transferCategory(t.accountId, line.transferAccountId);
        return line.needsCategory ? <NeedsCategoryPill /> : line.categoryName;
      }
      case "memo":
        return line.memo;
      case "outflow":
        return amount < 0n ? show(-amount, t.currency) : "";
      case "inflow":
        return amount > 0n ? show(amount, t.currency) : "";
      default:
        return null;
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && (
          <Button size="sm" onClick={() => startAdding()} disabled={!canAdd || adding}>
            <Plus /> Add transaction
          </Button>
        )}
        {recordPayment && canAdd && !readOnly && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => startAdding(recordPayment(), false)}
            disabled={adding}
          >
            <CreditCard /> Record Payment
          </Button>
        )}
        {!readOnly && canAdd && <FileImportButton accountId={accountId} />}
        {!canAdd && account?.closed && (
          <p className="text-muted-foreground text-sm">Reopen this account to add transactions.</p>
        )}
        <div className="ml-auto flex items-center gap-1">
          {!readOnly && <UndoRedoButtons />}
          <RegisterViewMenu
            view={view}
            onChange={setView}
            runningBalance={!allAccounts}
            oldestMonth={oldestMonth}
          />
          <RegisterSearchBox
            value={search.q ?? ""}
            onCommit={(text) => {
              const q = text.trim() ? text : undefined;
              saveSearch(budget.id, accountId ?? "all", q);
              onSearchChange({ q });
            }}
            placeholder={allAccounts ? "Search All Accounts" : `Search ${account?.name ?? ""}`}
            sources={searchSources}
          />
        </div>
      </div>
      {(!isEmpty(selection) || scheduledSelection.size > 0) && (
        <SelectionBar
          summary={selectionSummary}
          total={
            selectionSummary && !mixedCurrencies
              ? show(
                  BigInt(selectionSummary.total) + scheduledTotal,
                  selectionCurrency ?? undefined,
                )
              : null
          }
          allMatching={selection.mode === "all"}
          canSelectAll={
            !isEmpty(selection) &&
            (Boolean(hasNextPage) || loaded.length > (summary.data?.count ?? 0))
          }
          onSelectAll={() => setSelection({ mode: "all", except: new Set() })}
          onClear={clearSelection}
          flags={flags}
          categories={options}
          moveTargets={openAccounts.filter((a) => a.id !== accountId)}
          pending={bulk.isPending || scheduledBulk.isPending}
          onAction={requestBulk}
          onMatch={matchPair ? () => void matchSelected() : undefined}
          onUnmatch={unmatchable ? () => void unmatchRows(pickedRows.map((t) => t.id)) : undefined}
          scheduledCount={scheduledSelection.size}
          scheduledSplits={scheduledSplits(
            scheduledRows.filter((row) => scheduledSelection.has(row.id)),
          )}
          onMakeRepeating={repeatable ? () => makeRepeating(repeatable) : undefined}
          onExport={() => {
            exportSelected(budget, selectionBody(selection, selectionFilter)).catch(() =>
              toast.error("Couldn't export the selected transactions."),
            );
          }}
        />
      )}

      <ChangeHistoryDialog
        transactionId={historyFor}
        onOpenChange={(open) => !open && setHistoryFor(null)}
      />

      <AlertDialog
        open={warning !== null}
        onOpenChange={(open) => {
          // Closing after Save/Delete is not a cancel (this runs after the action's onClick).
          if (open || !warning || proceeding.current) return;
          warning.cancel?.();
          setWarning(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{warning?.warning.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="grid gap-2">
                {warning?.warning.paragraphs.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={warning?.warning.confirm === "Delete" ? "destructive" : "default"}
              onClick={() => {
                const proceed = warning?.proceed;
                proceeding.current = true;
                setWarning(null);
                proceed?.();
                queueMicrotask(() => {
                  proceeding.current = false;
                });
              }}
            >
              {warning?.warning.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* An overlay scrollbar inside the rounded border, instead of a native one that takes a strip
          beside the header and squares off its corner. */}
      <ScrollArea
        viewportRef={scrollRef}
        // A query container: the editor's footer sizes to its visible width (EVERYCENT-194).
        viewportClassName="@container max-h-[70vh]"
        scrollbars="both"
        className="rounded-lg border"
      >
        <Table
          containerClassName="overflow-visible"
          className="table-fixed"
          // The fixed columns plus room for Memo (which takes what's left): a narrow window scrolls
          // sideways, Cleared and Actions staying pinned, rather than squeezing Memo to nothing.
          style={{
            minWidth: `calc(${MEMO_MIN_WIDTH}${columnIds
              .map((id) => COLUMN_SPECS[id].width)
              .filter(Boolean)
              .map((w) => ` + ${w}`)
              .join("")})`,
          }}
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
                  // The arrow shows on the first sort field; the rest break its ties.
                  const active = sortBy !== undefined && sortBy === sort;
                  const HeaderIcon =
                    id === "flag" ? Bookmark : id === "cleared" ? CircleCheck : null;
                  const pin = pinned(columnIds, id);
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                      style={pin?.style}
                      className={cn(
                        "bg-muted text-muted-foreground text-xs uppercase",
                        pin && [pin.className, PINNED_BG.head],
                        spec.align === "right" && "text-right",
                        // Centred like the column's cells (the flag and cleared icons).
                        spec.align === "center" && "text-center",
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
                              : (selection.ids.size > 0 || scheduledSelection.size > 0) &&
                                "indeterminate"
                          }
                          disabled={loaded.length === 0 && scheduledRows.length === 0}
                          onCheckedChange={() => {
                            // Select all takes the scheduled rows along, as YNAB's does.
                            if (selection.mode === "all") return clearSelection();
                            setSelection({ mode: "all", except: new Set() });
                            setScheduledSelection(new Set(scheduledRows.map((row) => row.id)));
                          }}
                        />
                      ) : id === "balance" ? (
                        <BalanceHeader
                          sorted={!dateOrder}
                          onResetSort={() => setView({ sort: [...DEFAULT_SORT] })}
                        />
                      ) : sortBy ? (
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 uppercase hover:text-foreground",
                            active && "text-foreground",
                          )}
                          onClick={() => setView({ sort: nextSort(view.sort, sortBy) })}
                        >
                          {HeaderIcon ? (
                            <>
                              <HeaderIcon className="size-3.5" aria-hidden />
                              <span className="sr-only">{spec.header}</span>
                            </>
                          ) : (
                            spec.header
                          )}
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
          <TableBody ref={measureScheduled}>
            {adding && defaultAccountId && (
              <TransactionEditor
                transferCategory={transferCategory}
                key={addingKey}
                initial={addingDraft ?? newDraft(defaultAccountId, today)}
                openDatePicker={addingPicker}
                repeat
                columns={columnIds}
                accounts={openAccounts}
                payees={payeeList}
                categories={options}
                dateFormat={budget.dateFormat}
                settings={budget}
                flags={flags}
                onRenameFlags={renameFlags}
                pending={create.isPending || createScheduled.isPending}
                error={newError}
                onSave={(draft) => void saveNew(draft)}
                onSaveAndAddAnother={(draft) => void saveNew(draft, true)}
                onCancel={() => setAdding(false)}
              />
            )}
            <ScheduledSection
              rows={scheduledRows}
              selected={scheduledSelection}
              onSelect={toggleScheduled}
              columns={columnIds}
              collapsed={view.scheduledCollapsed}
              onToggle={() => setView({ scheduledCollapsed: !view.scheduledCollapsed })}
              accounts={accountList}
              payees={payeeList}
              categories={options}
              flags={flags}
              onRenameFlags={renameFlags}
              today={today}
              onChanged={refresh}
            />
          </TableBody>
          <TableBody>
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
                    transferCategory={transferCategory}
                    key={t.id}
                    initial={editingSplit.draft}
                    label="Edit transaction"
                    columns={columnIds}
                    accounts={editorAccounts(accountList, t.accountId)}
                    accountChoices={movableAccounts(accountList, t)}
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
                      const pin = pinned(columnIds, id);
                      return (
                        <TableCell
                          key={id}
                          style={pin?.style}
                          className={cn(
                            "truncate py-1.5",
                            pin && [pin.className, PINNED_BG.row],
                            spec.align === "right" && "text-right tabular-nums",
                            isEditable(id) && !readOnly && "cursor-text",
                          )}
                          onClick={isEditable(id) && !readOnly ? () => openSplit(t) : undefined}
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
                  data-transaction-id={t.id}
                  data-highlighted={highlightId === t.id || undefined}
                  data-state={isSelected(selection, t.id) ? "selected" : undefined}
                  // One height for every row, so an icon or an open editor doesn't grow it.
                  style={{ height: ROW_HEIGHT }}
                  className={cn(
                    // A quick hover; a row jumped to glows, then fades out.
                    "duration-100 data-highlighted:animate-[row-highlight_2.5s_ease-out]",
                    future && "text-muted-foreground italic",
                    // YNAB sets unapproved rows in bold.
                    !t.approved && "font-semibold",
                  )}
                  title={future ? "Upcoming: not in the balance until its date" : undefined}
                >
                  {columnIds.map((id) => {
                    const spec = COLUMN_SPECS[id];
                    const pin = pinned(columnIds, id);
                    if (editing?.id === t.id && editing.column === id) {
                      return (
                        <TableCell key={id} className="px-1.5 py-1">
                          <CellEditor
                            transaction={t}
                            column={editing.column}
                            settings={inCurrency(budget, t.currency)}
                            dateFormat={budget.dateFormat}
                            accounts={movableAccounts(accountList, t)}
                            payees={payeeList}
                            transfers={transferTargets(t)}
                            categories={options}
                            onSplit={
                              !t.transferFromSplit && !t.transferAccountId
                                ? () => openSplit(t, true)
                                : undefined
                            }
                            onMakeRepeating={
                              t.transferFromSplit ? undefined : () => makeRepeating(t)
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
                        style={pin?.style}
                        className={cn(
                          "truncate",
                          pin && [pin.className, PINNED_BG.row],
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
      </ScrollArea>

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
      {rows.length === 0 && scheduledRows.length === 0 && !adding && !someHidden && (
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
