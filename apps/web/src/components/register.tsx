import { money, usesCategory } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeftRight,
  Circle,
  CircleCheck,
  Lock,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type Account, accountsQueryOptions } from "@/lib/accounts";
import { $api } from "@/lib/api";
import { useBudget } from "@/lib/budget-context";
import { apiErrorMessage } from "@/lib/budgets";
import { categoriesQueryOptions } from "@/lib/categories";
import { todayIso } from "@/lib/dates";
import {
  type CellColumn,
  categoryOptions,
  cellUpdate,
  createBody,
  type Draft,
  emptyDraft,
  payeesQueryOptions,
  type Transaction,
  transactionsQueryOptions,
  transactionsQueryPrefix,
} from "@/lib/transactions";
import { CellEditor, type CellExit } from "./cell-editor";
import { COLUMN_SPECS, type ColumnId, isEditable, registerColumns } from "./register-columns";
import { TransactionEditor } from "./transaction-editor";

const features = tableFeatures({});
const column = createColumnHelper<typeof features, Transaction>();
const EMPTY: Transaction[] = [];
const ROW_HEIGHT = 41;

interface EditingCell {
  id: string;
  column: CellColumn;
}

/**
 * An account's register, or all accounts' (`accountId` left out), newest first. New
 * transactions get a full row; existing ones are edited a cell at a time, as in YNAB. Rows are
 * virtualized so long histories stay fast. `focusId` scrolls to that transaction and highlights
 * it (the other side of a transfer, when jumping to it).
 */
export function Register({ accountId, focusId }: { accountId?: string; focusId?: string }) {
  const { budget, formatAmount, formatDate } = useBudget();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const transactions = useQuery(transactionsQueryOptions(budget.id, accountId));
  const accounts = useQuery(accountsQueryOptions(budget.id));
  const categories = useQuery(categoriesQueryOptions(budget.id));
  const payees = useQuery(payeesQueryOptions(budget.id));
  const create = $api.useMutation("post", "/v1/budgets/{budgetId}/transactions");
  const update = $api.useMutation("patch", "/v1/budgets/{budgetId}/transactions/{transactionId}");
  const remove = $api.useMutation("delete", "/v1/budgets/{budgetId}/transactions/{transactionId}");
  const [adding, setAdding] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);

  const allAccounts = accountId === undefined;
  const columnIds = useMemo(() => registerColumns(allAccounts), [allAccounts]);
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
    data: transactions.data?.transactions ?? EMPTY,
    getRowId: (t) => t.id,
  });
  const rows = table.getRowModel().rows;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 12,
    // Lets jsdom (no layout) render the first screen of rows.
    initialRect: { width: 1280, height: 800 },
  });
  const items = virtualizer.getVirtualItems();

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || focused.current === focusId) return;
    const index = rows.findIndex((r) => r.id === focusId);
    if (index === -1) return;
    focused.current = focusId;
    virtualizer.scrollToIndex(index, { align: "center" });
    setHighlightId(focusId);
    const timer = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(timer);
  }, [focusId, rows, virtualizer]);
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: transactionsQueryPrefix }),
      queryClient.invalidateQueries({ queryKey: accountsQueryOptions(budget.id).queryKey }),
      queryClient.invalidateQueries({ queryKey: payeesQueryOptions(budget.id).queryKey }),
      queryClient.invalidateQueries({ queryKey: categoriesQueryOptions(budget.id).queryKey }),
    ]);
  }

  /** Whether `t` has a category: not in tracking accounts, nor on in-budget transfers. */
  function hasCategory(t: Transaction) {
    const type = accountById.get(t.accountId)?.type ?? "checking";
    const transferType = t.transferAccountId ? accountById.get(t.transferAccountId)?.type : null;
    return usesCategory(type, transferType);
  }

  /** The cells of `t` that can be edited, in Tab order. */
  function editableColumns(t: Transaction): CellColumn[] {
    const categorized = hasCategory(t);
    return columnIds.filter(
      (c): c is CellColumn => isEditable(c) && (c !== "category" || categorized),
    );
  }

  /** Accounts the payee cell offers transfers to: other open ones, plus the current target. */
  function transferTargets(t: Transaction) {
    return accountList.filter(
      (a) => a.id !== t.accountId && (!a.closed || a.id === t.transferAccountId),
    );
  }

  function jumpToOtherSide(t: Transaction) {
    if (!t.transferAccountId || !t.transferTransactionId) return;
    void navigate({
      to: "/budgets/$budgetId/accounts/$accountId",
      params: { budgetId: budget.id, accountId: t.transferAccountId },
      search: { transaction: t.transferTransactionId },
    });
  }

  function startAdding() {
    setEditing(null);
    setNewError(null);
    setAdding(true);
  }

  async function saveNew(draft: Draft) {
    if (!draft.date) return setNewError("Enter a date.");
    const result = createBody(draft, budget);
    if (!result.ok) return setNewError(result.error);
    try {
      await create.mutateAsync({ params: { path: { budgetId: budget.id } }, body: result.body });
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
      await update.mutateAsync({
        params: { path: { budgetId: budget.id, transactionId: t.id } },
        body: result.body,
      });
      await refresh();
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't save the change."));
    }
  }

  async function toggleCleared(t: Transaction) {
    try {
      await update.mutateAsync({
        params: { path: { budgetId: budget.id, transactionId: t.id } },
        body: { cleared: t.cleared === "uncleared" ? "cleared" : "uncleared" },
      });
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
      await refresh();
      toast.success(
        t.transferAccountId ? "Transfer deleted from both accounts" : "Transaction deleted",
      );
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't delete the transaction."));
    }
  }

  const defaultAccountId = accountId ?? openAccounts[0]?.id;
  const canAdd = defaultAccountId !== undefined && (allAccounts || account?.closed === false);

  if (transactions.isPending) return <Skeleton className="h-64" />;

  function display(t: Transaction, id: ColumnId) {
    const amount = BigInt(t.amount);
    switch (id) {
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
              <DropdownMenuItem variant="destructive" onSelect={() => void handleDelete(t)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={startAdding} disabled={!canAdd || adding}>
          <Plus /> Add transaction
        </Button>
        {!canAdd && account?.closed && (
          <p className="text-muted-foreground text-sm">Reopen this account to add transactions.</p>
        )}
      </div>

      <Table
        containerRef={scrollRef}
        containerClassName="max-h-[70vh] overflow-auto rounded-lg border"
        className="min-w-[64rem] table-fixed"
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
                const spec = COLUMN_SPECS[header.column.id as ColumnId];
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "bg-muted text-muted-foreground text-xs uppercase",
                      spec.align === "right" && "text-right",
                    )}
                  >
                    <span className={cn(spec.srOnly && "sr-only")}>{spec.header}</span>
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
              pending={create.isPending}
              error={newError}
              onSave={(draft) => void saveNew(draft)}
              onCancel={() => setAdding(false)}
            />
          )}
          {paddingTop > 0 && <tr aria-hidden style={{ height: paddingTop }} />}
          {items.map((item) => {
            const t = rows[item.index]?.original;
            if (!t) return null;
            const future = t.date > today;
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
                        id === "actions" && "py-1",
                        (id === "category" || id === "memo") && "text-muted-foreground",
                        canEdit && "cursor-text",
                      )}
                      onClick={
                        canEdit
                          ? () => setEditing({ id: t.id, column: id as CellColumn })
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

      {rows.length === 0 && !adding && (
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

/** Accounts a transaction can move to: open ones, plus the one it's in. */
function editorAccounts(accounts: readonly Account[], current: string) {
  return accounts.filter((a) => !a.closed || a.id === current);
}
