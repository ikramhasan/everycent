import { Button } from "@everycent/ui/components/button";
import { Field, FieldError, FieldLabel } from "@everycent/ui/components/field";
import { Input } from "@everycent/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { cn } from "@everycent/ui/lib/utils";
import { type FormEvent, useState } from "react";
import { type MoneyOption, minAmount } from "@/lib/months";
import { CategoryField } from "./register-fields";

export interface MoveActions {
  /** Ready to Assign and the visible categories, with what's available in each. */
  options: readonly MoneyOption[];
  readyToAssignId: string;
  /** Reads typed text (math allowed) into minor units, or explains why not. */
  parse: (text: string) => bigint | string;
  /** Minor units as an input value, without the currency symbol. */
  toInput: (amount: string) => string;
  move: (fromCategoryId: string, toCategoryId: string, amount: bigint) => Promise<void>;
}

type Format = (minorUnits: string) => string;

/** Available as YNAB shows it: a pill, green with money, red when overspent, grey at zero. */
export function AvailablePill({
  amount,
  format,
  className,
}: {
  amount: string;
  format: Format;
  className?: string;
}) {
  const sign = amount === "0" ? 0 : amount.startsWith("-") ? -1 : 1;
  return (
    <span
      className={cn(
        "inline-block max-w-full truncate rounded-full px-2 py-0.5 align-middle font-medium text-sm",
        sign > 0 && "bg-green-100 text-green-900 dark:bg-green-900/50 dark:text-green-100",
        sign < 0 && "bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-100",
        sign === 0 && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {format(amount)}
    </span>
  );
}

/**
 * A category's Available pill, which opens YNAB's money moves: "Move … To" when there's money,
 * "Cover overspending from" when it's overspent.
 */
export function AvailableButton({
  categoryId,
  categoryName,
  amount,
  format,
  actions,
}: {
  categoryId: string;
  categoryName: string;
  amount: string;
  format: Format;
  actions: MoveActions;
}) {
  const [open, setOpen] = useState(false);
  const overspent = amount.startsWith("-");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${overspent ? "Cover" : "Move"} ${categoryName}: ${format(amount)}`}
          className="max-w-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AvailablePill amount={amount} format={format} className="hover:brightness-95" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        {overspent ? (
          <PickSourceForm
            label="Cover overspending from"
            options={actions.options.filter((o) => o.id !== categoryId && BigInt(o.available) > 0n)}
            format={format}
            onCancel={() => setOpen(false)}
            onPick={async (source) => {
              setOpen(false);
              // YNAB covers as much as the source has, up to the overspending.
              const amountToCover = minAmount(BigInt(source.available), -BigInt(amount));
              await actions.move(source.id, categoryId, amountToCover);
            }}
          />
        ) : (
          <MoveForm
            categoryId={categoryId}
            amount={amount}
            format={format}
            actions={actions}
            onDone={() => setOpen(false)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function MoveForm({
  categoryId,
  amount,
  format,
  actions,
  onDone,
}: {
  categoryId: string;
  amount: string;
  format: Format;
  actions: MoveActions;
  onDone: () => void;
}) {
  const [text, setText] = useState(() => actions.toInput(amount));
  const [to, setTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const describe = describer(actions.options, format);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!to) return;
    const parsed = actions.parse(text);
    if (typeof parsed === "string") return setError(parsed);
    if (parsed <= 0n) return setError("Enter an amount to move");
    onDone();
    await actions.move(categoryId, to, parsed);
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="move-amount">Move</FieldLabel>
        <Input
          id="move-amount"
          autoFocus
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onFocus={(e) => e.currentTarget.select()}
          className="text-right tabular-nums"
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <Field>
        <FieldLabel>To</FieldLabel>
        <CategoryField
          label="Move to"
          placeholder=""
          value={to}
          onChange={setTo}
          categories={actions.options.filter((o) => o.id !== categoryId)}
          describe={describe}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!to}>
          OK
        </Button>
      </div>
    </form>
  );
}

/** A form that only picks a category to take money from, as YNAB's cover and Fix This do. */
function PickSourceForm({
  label,
  options,
  format,
  onCancel,
  onPick,
}: {
  label: string;
  options: readonly MoneyOption[];
  format: Format;
  onCancel: () => void;
  onPick: (source: MoneyOption) => Promise<void>;
}) {
  const [from, setFrom] = useState<string | null>(null);
  const source = options.find((o) => o.id === from);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (source) void onPick(source);
      }}
      className="grid gap-3"
    >
      <Field>
        <FieldLabel>{label}</FieldLabel>
        <CategoryField
          label={label}
          placeholder=""
          value={from}
          onChange={setFrom}
          categories={options}
          describe={describer(options, format)}
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!source}>
          OK
        </Button>
      </div>
    </form>
  );
}

/**
 * YNAB's "Fix This" on a negative Ready to Assign: takes the shortfall back from one category
 * (as much as it has).
 */
export function FixThisButton({
  readyToAssign,
  format,
  actions,
}: {
  readyToAssign: string;
  format: Format;
  actions: MoveActions;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="destructive">
          Fix This
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PickSourceForm
          label="Un-assign money from"
          options={actions.options.filter(
            (o) => o.id !== actions.readyToAssignId && BigInt(o.available) > 0n,
          )}
          format={format}
          onCancel={() => setOpen(false)}
          onPick={async (source) => {
            setOpen(false);
            const shortfall = -BigInt(readyToAssign);
            await actions.move(
              source.id,
              actions.readyToAssignId,
              minAmount(BigInt(source.available), shortfall),
            );
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function describer(options: readonly MoneyOption[], format: Format) {
  const available = new Map(options.map((o) => [o.id, o.available]));
  return (option: { id: string }) => {
    const amount = available.get(option.id) ?? "0";
    return (
      <span
        className={cn(
          amount.startsWith("-")
            ? "text-destructive"
            : amount !== "0" && "text-green-700 dark:text-green-400",
        )}
      >
        {format(amount)}
      </span>
    );
  };
}
