import {
  type BudgetFormatSettings,
  CURRENCY_SYMBOL_POSITIONS,
  type CurrencyCode,
  type CurrencySymbolPosition,
  currencyExponent,
  DATE_FORMATS,
  type DateFormat,
  formatAmount,
  formatDate,
  type Money,
  money,
  NUMBER_FORMATS,
  type NumberFormat,
} from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { Input } from "@everycent/ui/components/input";
import { Label } from "@everycent/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@everycent/ui/components/native-select";
import { type FormEvent, useState } from "react";
import { CurrencyPicker, currencyName } from "./currency-picker";

export interface BudgetFormValues extends BudgetFormatSettings {
  name: string;
  currency: CurrencyCode;
}

/** -1,234,567.89 in the currency's own precision, so the preview shows grouping and decimals. */
function previewAmount(currency: CurrencyCode): Money {
  return money(-(123456789n * 10n ** BigInt(currencyExponent(currency))) / 100n, currency);
}

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const SYMBOL_POSITION_LABELS: Record<CurrencySymbolPosition, string> = {
  before: "Before amount",
  after: "After amount",
  none: "Don't show",
};

export function BudgetForm({
  defaultValues,
  currencyLocked = false,
  submitLabel,
  pendingLabel,
  onSubmit,
}: {
  defaultValues: BudgetFormValues;
  /** The base currency can't change after creation. */
  currencyLocked?: boolean;
  submitLabel: string;
  pendingLabel: string;
  /** Resolves to an error message to show, or null on success. */
  onSubmit: (values: BudgetFormValues) => Promise<string | null>;
}) {
  const [values, setValues] = useState(defaultValues);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = <K extends keyof BudgetFormValues>(key: K, value: BudgetFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const today = todayIso();
  const sample = previewAmount(values.currency);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const message = await onSubmit({ ...values, name: values.name.trim() });
    setPending(false);
    setError(message);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="budget-name">Budget name</Label>
        <Input
          id="budget-name"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={100}
          required
          autoFocus={!currencyLocked}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="budget-currency">Currency</Label>
        {currencyLocked ? (
          <>
            <Input
              id="budget-currency"
              value={`${values.currency} — ${currencyName(values.currency)}`}
              disabled
            />
            <p className="text-muted-foreground text-xs">
              Currency can't be changed after creation.
            </p>
          </>
        ) : (
          <CurrencyPicker
            id="budget-currency"
            value={values.currency}
            onChange={(code) => set("currency", code)}
          />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="budget-number-format">Number format</Label>
          <NativeSelect
            id="budget-number-format"
            value={values.numberFormat}
            onChange={(e) => set("numberFormat", e.target.value as NumberFormat)}
          >
            {NUMBER_FORMATS.map((f) => (
              <NativeSelectOption key={f} value={f}>
                {formatAmount(money(123456789n, "USD"), {
                  numberFormat: f,
                  currencySymbolPosition: "none",
                  dateFormat: values.dateFormat,
                })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="budget-symbol-position">Currency symbol</Label>
          <NativeSelect
            id="budget-symbol-position"
            value={values.currencySymbolPosition}
            onChange={(e) =>
              set("currencySymbolPosition", e.target.value as CurrencySymbolPosition)
            }
          >
            {CURRENCY_SYMBOL_POSITIONS.map((p) => (
              <NativeSelectOption key={p} value={p}>
                {SYMBOL_POSITION_LABELS[p]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="budget-date-format">Date format</Label>
          <NativeSelect
            id="budget-date-format"
            value={values.dateFormat}
            onChange={(e) => set("dateFormat", e.target.value as DateFormat)}
          >
            {DATE_FORMATS.map((f) => (
              <NativeSelectOption key={f} value={f}>
                {formatDate(today, f)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Preview: </span>
        <output aria-label="Preview" className="font-medium tabular-nums">
          {formatAmount(sample, values)} · {formatDate(today, values.dateFormat)}
        </output>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
