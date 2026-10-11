import type { DateFormat } from "@everycent/engine";
import { Input } from "@everycent/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@everycent/ui/components/native-select";
import { type FocusEvent, type KeyboardEvent, useRef, useState } from "react";
import type { Account } from "@/lib/accounts";
import type { MoneySettings } from "@/lib/money-input";
import {
  type CategoryOption,
  type CellColumn,
  cellValue,
  type Payee,
  type Transaction,
} from "@/lib/transactions";
import {
  CategoryField,
  DateField,
  isInsidePopup,
  listOwnsKey,
  PayeeField,
  type TransferTarget,
} from "./register-fields";

export type CellExit = "stay" | "next" | "previous";

/**
 * Edits one cell of an existing transaction in place, as YNAB does. Enter or clicking away
 * saves, Tab saves and moves to the next cell, Esc cancels.
 */
export function CellEditor({
  transaction,
  column,
  settings,
  dateFormat,
  accounts,
  payees,
  transfers,
  categories,
  onSplit,
  onMakeRepeating,
  onCommit,
  onCancel,
}: {
  transaction: Transaction;
  column: CellColumn;
  settings: MoneySettings;
  dateFormat: DateFormat;
  accounts: readonly Account[];
  payees: readonly Payee[];
  /** Accounts the payee cell offers as transfers. */
  transfers: readonly TransferTarget[];
  categories: readonly CategoryOption[];
  /** Offers "Split" in the category list; the register then opens the whole-split editor. */
  onSplit?: () => void;
  /** Offers "Make Repeating" in the date picker; the register then opens a new scheduled row. */
  onMakeRepeating?: () => void;
  /** `transferAccountId` is set when the payee cell now holds a transfer. */
  onCommit: (value: string | null, exit: CellExit, transferAccountId: string | null) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(() => cellValue(transaction, column, settings));
  const [transferAccountId, setTransferAccountId] = useState(transaction.transferAccountId);
  // Enter/Tab commit and unmount the cell; the blur that may follow must not commit again.
  const done = useRef(false);

  function finish(exit: CellExit, next = value, transfer = transferAccountId) {
    if (done.current) return;
    done.current = true;
    onCommit(next, exit, transfer);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (listOwnsKey(event)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      done.current = true;
      onCancel();
    } else if (event.key === "Enter") {
      event.preventDefault();
      finish("stay");
    } else if (event.key === "Tab") {
      event.preventDefault();
      finish(event.shiftKey ? "previous" : "next");
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const to = event.relatedTarget;
    if (to instanceof Node && (event.currentTarget.contains(to) || isInsidePopup(to))) return;
    finish("stay");
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: groups the field's keyboard handling
    <div onKeyDown={handleKeyDown} onBlur={handleBlur}>
      {field()}
    </div>
  );

  function field() {
    switch (column) {
      case "account":
        return (
          <NativeSelect
            aria-label="Account"
            autoFocus
            value={value ?? ""}
            onChange={(e) => setValue(e.target.value)}
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
            value={value ?? transaction.date}
            onChange={setValue}
            onPick={(date) => finish("stay", date)}
            format={dateFormat}
            autoFocus
            onMakeRepeating={
              onMakeRepeating
                ? () => {
                    done.current = true;
                    onCancel();
                    onMakeRepeating();
                  }
                : undefined
            }
          />
        );
      case "payee":
        return (
          <PayeeField
            value={value ?? ""}
            onChange={(choice) => {
              setValue(choice.name);
              setTransferAccountId(choice.transferAccountId);
            }}
            onPick={(choice) => finish("stay", choice.name, choice.transferAccountId)}
            payees={payees}
            transfers={transfers}
            autoFocus
          />
        );
      case "category":
        return (
          <CategoryField
            value={value}
            onChange={(id) => finish("stay", id)}
            onSplit={
              onSplit
                ? () => {
                    done.current = true;
                    onSplit();
                  }
                : undefined
            }
            categories={categories}
            autoFocus
          />
        );
      case "memo":
        return (
          <Input
            aria-label="Memo"
            autoFocus
            value={value ?? ""}
            onChange={(e) => setValue(e.target.value)}
            className="h-8"
          />
        );
      case "outflow":
      case "inflow":
        return (
          <Input
            aria-label={column === "outflow" ? "Outflow" : "Inflow"}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            inputMode="decimal"
            value={value ?? ""}
            onChange={(e) => setValue(e.target.value)}
            className="h-8 text-right tabular-nums"
          />
        );
    }
  }
}
