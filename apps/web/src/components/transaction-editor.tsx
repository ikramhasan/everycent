import { type DateFormat, isOnBudget } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { FieldError } from "@everycent/ui/components/field";
import { Input } from "@everycent/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@everycent/ui/components/native-select";
import { TableCell, TableRow } from "@everycent/ui/components/table";
import { cn } from "@everycent/ui/lib/utils";
import { Circle, CircleCheck } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import type { Account } from "@/lib/accounts";
import type { CategoryOption, Draft, Payee } from "@/lib/transactions";
import type { ColumnId } from "./register-columns";
import { CategoryField, DateField, isListOpen, PayeeField } from "./register-fields";

/**
 * The row for a new transaction, like YNAB's: Tab moves between fields, Enter saves, Esc
 * cancels. The second row holds the buttons and any error.
 */
export function TransactionEditor({
  initial,
  columns,
  accounts,
  payees,
  categories,
  dateFormat,
  pending,
  error,
  onSave,
  onCancel,
}: {
  initial: Draft;
  columns: readonly ColumnId[];
  /** Accounts a new transaction can go in (open ones). */
  accounts: readonly Account[];
  payees: readonly Payee[];
  categories: readonly CategoryOption[];
  dateFormat: DateFormat;
  pending: boolean;
  error: string | null;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const account = accounts.find((a) => a.id === draft.accountId);
  const needsCategory = account ? isOnBudget(account.type) : true;

  function handleKeyDown(event: KeyboardEvent) {
    if (isListOpen(event.target)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      onSave(draft);
    }
  }

  function cell(column: ColumnId) {
    switch (column) {
      case "account":
        return (
          <NativeSelect
            aria-label="Account"
            value={draft.accountId}
            onChange={(e) => {
              const next = accounts.find((a) => a.id === e.target.value);
              set({
                accountId: e.target.value,
                ...(next && !isOnBudget(next.type) ? { categoryId: null } : {}),
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
          />
        );
      case "payee":
        return (
          <PayeeField
            value={draft.payeeName}
            payees={payees}
            onChange={(payeeName, payee) =>
              setDraft((d) => ({
                ...d,
                payeeName,
                // YNAB fills in the category last used with this payee.
                ...(payee?.lastCategoryId && needsCategory && d.categoryId === null
                  ? { categoryId: payee.lastCategoryId }
                  : {}),
              }))
            }
          />
        );
      case "category":
        return needsCategory ? (
          <CategoryField
            value={draft.categoryId}
            onChange={(categoryId) => set({ categoryId })}
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

  return (
    <>
      <TableRow
        aria-label="New transaction"
        className="border-b-0 bg-muted/50 hover:bg-muted/50"
        onKeyDown={handleKeyDown}
      >
        {columns.map((column) => (
          <TableCell key={column} className={cn("px-1.5", column === "cleared" && "text-center")}>
            {cell(column)}
          </TableCell>
        ))}
      </TableRow>
      <TableRow className="bg-muted/50 hover:bg-muted/50" onKeyDown={handleKeyDown}>
        <TableCell colSpan={columns.length} className="px-1.5 pt-0">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {error && <FieldError className="mr-auto">{error}</FieldError>}
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => onSave(draft)} disabled={pending}>
              Save
            </Button>
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}
