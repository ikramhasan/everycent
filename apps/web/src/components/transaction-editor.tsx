import { type DateFormat, formatAmount, money, usesCategory } from "@everycent/engine";
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
import { FieldError } from "@everycent/ui/components/field";
import { Input } from "@everycent/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@everycent/ui/components/native-select";
import { TableCell, TableRow } from "@everycent/ui/components/table";
import { cn } from "@everycent/ui/lib/utils";
import { Circle, CircleCheck, Plus, Split, X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import type { Account } from "@/lib/accounts";
import type { Flag } from "@/lib/flags";
import type { MoneySettings } from "@/lib/money-input";
import {
  type CategoryOption,
  type Draft,
  emptyLine,
  type LineDraft,
  type Payee,
  remainingLabel,
  splitMismatch,
  splitRemaining,
  startSplit,
  withSplitTotal,
} from "@/lib/transactions";
import { FlagMenu } from "./flag-menu";
import type { ColumnId } from "./register-columns";
import { CategoryField, DateField, listOwnsKey, PayeeField } from "./register-fields";

/**
 * The row for a new transaction (or a whole split being edited), like YNAB's: Tab moves between
 * fields, Enter saves, Esc cancels. A split adds a row per line, then a row to add lines and see
 * what's left to split; the last row holds the buttons and any error.
 */
export function TransactionEditor({
  initial,
  columns,
  accounts,
  payees,
  categories,
  dateFormat,
  settings,
  flags,
  onRenameFlags,
  label = "New transaction",
  repeat = false,
  scheduled = false,
  openDatePicker = false,
  pending,
  error,
  onSave,
  onSaveAndAddAnother,
  onCancel,
}: {
  initial: Draft;
  columns: readonly ColumnId[];
  /** Accounts a new transaction can go in (open ones). */
  accounts: readonly Account[];
  payees: readonly Payee[];
  categories: readonly CategoryOption[];
  dateFormat: DateFormat;
  settings: MoneySettings;
  flags: readonly Flag[];
  onRenameFlags: (changes: Flag[]) => Promise<void>;
  /** Names the editor's row for screen readers. */
  label?: string;
  /** Offer YNAB's "Repeat:" in the date picker (new and scheduled transactions). */
  repeat?: boolean;
  /** A scheduled transaction: it has no cleared state until it's entered. */
  scheduled?: boolean;
  /** Open the date picker first (Make Repeating, as YNAB does). */
  openDatePicker?: boolean;
  pending: boolean;
  error: string | null;
  onSave: (draft: Draft) => void;
  /** A new row's "Save and add another" (also its Enter); the next row keeps the date. */
  onSaveAndAddAnother?: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const account = accounts.find((a) => a.id === draft.accountId);
  const transferTo = accounts.find((a) => a.id === draft.transferAccountId);
  const needsCategory = account ? usesCategory(account.type, transferTo?.type) : true;
  // Money can move to any other open account; a split can't itself be a transfer (its lines can).
  const transfers = accounts.filter((a) => a.id !== draft.accountId);
  const lines = draft.lines;
  const canSplit = account ? usesCategory(account.type, null) && !draft.transferAccountId : false;

  function setLine(key: string, patch: Partial<LineDraft>) {
    setDraft((d) => ({
      ...d,
      lines: d.lines?.map((l) => (l.key === key ? { ...l, ...patch } : l)) ?? null,
    }));
  }
  function removeLine(key: string) {
    setDraft((d) => ({ ...d, lines: d.lines?.filter((l) => l.key !== key) ?? null }));
  }

  // YNAB's "Something Doesn't Add Up": saving a split whose lines miss its total asks first.
  const [mismatch, setMismatch] = useState<ReturnType<typeof splitMismatch>>(null);
  function save(another = false) {
    const found = splitMismatch(draft, settings);
    if (found) setMismatch(found);
    else if (another && onSaveAndAddAnother) onSaveAndAddAnother(draft);
    else onSave(draft);
  }
  const show = (amount: bigint) => formatAmount(money(amount, settings.currency), settings);

  function handleKeyDown(event: KeyboardEvent) {
    // The prompt's keys reach the row through the portal; they're the prompt's own.
    if (listOwnsKey(event) || mismatch) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      // On a new row, YNAB's Enter is "Save and add another" (2026-10-15).
      save(true);
    }
  }

  function cell(column: ColumnId) {
    switch (column) {
      case "select":
        return null;
      case "flag":
        return (
          <FlagMenu
            value={draft.flag}
            flags={flags}
            onChange={(flag) => set({ flag })}
            onRename={onRenameFlags}
          />
        );
      case "account":
        return (
          <NativeSelect
            aria-label="Account"
            // First field of the row (the date is, without an account column).
            autoFocus
            value={draft.accountId}
            onChange={(e) => {
              const next = accounts.find((a) => a.id === e.target.value);
              // An account can't transfer to itself.
              const self = draft.transferAccountId === e.target.value;
              set({
                accountId: e.target.value,
                ...(self ? { payeeName: "", transferAccountId: null } : {}),
                ...(next && !usesCategory(next.type, self ? null : transferTo?.type)
                  ? { categoryId: null, lines: null }
                  : {}),
              });
            }}
            className="h-8 w-full"
          >
            {accounts.map((a) => (
              <NativeSelectOption key={a.id} value={a.id}>
                {a.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        );
      case "date":
        return (
          <DateField
            value={draft.date}
            onChange={(date) => set({ date })}
            format={dateFormat}
            autoFocus={!columns.includes("account")}
            defaultOpen={openDatePicker}
            repeat={
              repeat
                ? { value: draft.frequency ?? "never", onChange: (frequency) => set({ frequency }) }
                : undefined
            }
          />
        );
      case "payee":
        return (
          <PayeeField
            value={draft.payeeName}
            payees={payees}
            transfers={lines ? [] : transfers}
            onChange={({ name, transferAccountId, payee }) =>
              setDraft((d) => {
                const to = accounts.find((a) => a.id === transferAccountId);
                const uses = account ? usesCategory(account.type, to?.type) : true;
                return {
                  ...d,
                  payeeName: name,
                  transferAccountId,
                  ...(!uses ? { categoryId: null } : {}),
                  // YNAB fills in the category last used with this payee.
                  ...(payee?.lastCategoryId && uses && d.categoryId === null && !d.lines
                    ? { categoryId: payee.lastCategoryId }
                    : {}),
                };
              })
            }
          />
        );
      case "category":
        if (lines) {
          return (
            <p className="flex items-center gap-1.5 px-2 text-sm">
              <Split className="size-4 text-muted-foreground" />
              Split ({lines.length} lines)
            </p>
          );
        }
        return needsCategory ? (
          <CategoryField
            value={draft.categoryId}
            onChange={(categoryId) => set({ categoryId })}
            onSplit={canSplit ? () => setDraft(startSplit) : undefined}
            categories={categories}
          />
        ) : (
          <p className="px-2 text-muted-foreground text-sm italic">Category not needed</p>
        );
      case "memo":
        return (
          <Input
            aria-label="Memo"
            placeholder="Memo"
            value={draft.memo}
            onChange={(e) => set({ memo: e.target.value })}
            className="h-8"
          />
        );
      case "outflow":
      case "inflow":
        return (
          <Input
            aria-label={column === "outflow" ? "Outflow" : "Inflow"}
            placeholder={column === "outflow" ? "Outflow" : "Inflow"}
            inputMode="decimal"
            value={draft[column]}
            // YNAB keeps one side: typing an outflow clears the inflow and vice versa.
            onChange={(e) =>
              set(
                column === "outflow"
                  ? { outflow: e.target.value, inflow: "" }
                  : { inflow: e.target.value, outflow: "" },
              )
            }
            className="h-8 text-right tabular-nums"
          />
        );
      case "cleared":
        if (scheduled) return null;
        return (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={draft.cleared === "cleared" ? "Cleared" : "Uncleared"}
            aria-pressed={draft.cleared === "cleared"}
            onClick={() => set({ cleared: draft.cleared === "cleared" ? "uncleared" : "cleared" })}
          >
            {draft.cleared === "cleared" ? (
              <CircleCheck className="text-primary" />
            ) : (
              <Circle className="text-muted-foreground" />
            )}
          </Button>
        );
      default:
        return null;
    }
  }

  function lineCell(line: LineDraft, index: number, column: ColumnId) {
    const to = accounts.find((a) => a.id === line.transferAccountId);
    const lineUses = account ? usesCategory(account.type, to?.type) : true;
    const name = `line ${index + 1}`;
    switch (column) {
      case "payee":
        return (
          <PayeeField
            label={`Payee, ${name}`}
            value={line.payeeName}
            payees={payees}
            transfers={transfers}
            onChange={({ name: payeeName, transferAccountId, payee }) => {
              const toAccount = accounts.find((a) => a.id === transferAccountId);
              const uses = account ? usesCategory(account.type, toAccount?.type) : true;
              setLine(line.key, {
                payeeName,
                transferAccountId,
                ...(!uses ? { categoryId: null } : {}),
                ...(payee?.lastCategoryId && uses && line.categoryId === null
                  ? { categoryId: payee.lastCategoryId }
                  : {}),
              });
            }}
          />
        );
      case "category":
        return lineUses ? (
          <CategoryField
            label={`Category, ${name}`}
            value={line.categoryId}
            onChange={(categoryId) => setLine(line.key, { categoryId })}
            categories={categories}
          />
        ) : (
          <p className="px-2 text-muted-foreground text-sm italic">Category not needed</p>
        );
      case "memo":
        return (
          <Input
            aria-label={`Memo, ${name}`}
            placeholder="Memo"
            value={line.memo}
            onChange={(e) => setLine(line.key, { memo: e.target.value })}
            className="h-8"
          />
        );
      case "outflow":
      case "inflow":
        return (
          <Input
            aria-label={`${column === "outflow" ? "Outflow" : "Inflow"}, ${name}`}
            placeholder={column === "outflow" ? "Outflow" : "Inflow"}
            inputMode="decimal"
            value={line[column]}
            onChange={(e) =>
              setLine(
                line.key,
                column === "outflow"
                  ? { outflow: e.target.value, inflow: "" }
                  : { inflow: e.target.value, outflow: "" },
              )
            }
            className="h-8 text-right tabular-nums"
          />
        );
      case "actions":
        return (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${name}`}
            onClick={() => removeLine(line.key)}
          >
            <X />
          </Button>
        );
      default:
        return null;
    }
  }

  const split = lines ? splitRemaining(draft, settings) : null;
  const remaining = split && "remaining" in split ? split.remaining : null;

  return (
    <>
      <TableRow
        aria-label={label}
        className="border-b-0 bg-muted/50 hover:bg-muted/50"
        onKeyDown={handleKeyDown}
      >
        {columns.map((column) => (
          <TableCell
            key={column}
            className={cn("px-1.5", (column === "cleared" || column === "flag") && "text-center")}
          >
            {cell(column)}
          </TableCell>
        ))}
      </TableRow>
      {lines?.map((line, index) => (
        <TableRow
          key={line.key}
          aria-label={`Split line ${index + 1}`}
          className="border-b-0 bg-muted/50 hover:bg-muted/50"
          onKeyDown={handleKeyDown}
        >
          {columns.map((column) => (
            <TableCell key={column} className="px-1.5 py-1">
              {lineCell(line, index, column)}
            </TableCell>
          ))}
        </TableRow>
      ))}
      <TableRow className="bg-muted/50 hover:bg-muted/50" onKeyDown={handleKeyDown}>
        <TableCell colSpan={columns.length} className="px-1.5 pt-0">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {lines && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => set({ lines: [...lines, emptyLine()] })}
                >
                  <Plus /> Add line
                </Button>
                <p
                  className={cn(
                    "mr-auto text-sm tabular-nums",
                    remaining !== null && remaining !== 0n
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                  aria-live="polite"
                >
                  {remaining === null ? "Check the amounts" : remainingLabel(remaining, settings)}
                </p>
              </>
            )}
            {error && <FieldError className="mr-auto">{error}</FieldError>}
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => save()} disabled={pending}>
              Save
            </Button>
            {onSaveAndAddAnother && (
              <Button type="button" size="sm" onClick={() => save(true)} disabled={pending}>
                Save and add another
              </Button>
            )}
          </div>
          <AlertDialog open={mismatch !== null} onOpenChange={(open) => !open && setMismatch(null)}>
            <AlertDialogContent className="data-[size=default]:sm:max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Something Doesn't Add Up</AlertDialogTitle>
                <AlertDialogDescription>
                  {mismatch &&
                    `The total is ${show(mismatch.total)}, but the splits add up to ${show(
                      mismatch.lines,
                    )}. How would you like to handle the unassigned ${show(mismatch.unassigned)}?`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {/* YNAB's order; each leaves the row open to check before saving. */}
              <AlertDialogFooter>
                {mismatch?.distributed && (
                  <AlertDialogAction
                    onClick={() => {
                      const lines = mismatch.distributed;
                      setDraft((d) => ({ ...d, lines }));
                    }}
                  >
                    Auto-Distribute
                  </AlertDialogAction>
                )}
                <AlertDialogAction
                  variant="outline"
                  onClick={() => setDraft((d) => withSplitTotal(d, settings))}
                >
                  Update Total
                </AlertDialogAction>
                <AlertDialogCancel>Adjust Manually</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TableCell>
      </TableRow>
    </>
  );
}
