import type { BudgetMonth } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { Field, FieldError, FieldLabel } from "@everycent/ui/components/field";
import { Input } from "@everycent/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@everycent/ui/components/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@everycent/ui/components/tabs";
import { cn } from "@everycent/ui/lib/utils";
import { CalendarDays, ChevronDown, CircleCheck, Zap } from "lucide-react";
import { type FormEvent, type ReactElement, type ReactNode, useState } from "react";
import type { TargetMark } from "@/lib/budget-view";
import { type MoneyOption, minAmount, monthLabel } from "@/lib/months";
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
  /** The same in another month (Fix This can un-assign from later months). */
  moveIn: (
    month: BudgetMonth,
    fromCategoryId: string,
    toCategoryId: string,
    amount: bigint,
  ) => Promise<void>;
}

type Format = (minorUnits: string) => string;

/**
 * Available as YNAB shows it: a pill, green with money, red when overspent, grey at zero. Yellow
 * ("cautious") is credit overspending, an underfunded target, and a payment category that doesn't
 * cover what the card owes.
 */
export function AvailablePill({
  amount,
  format,
  className,
  caution = false,
  target,
  icon,
}: {
  amount: string;
  format: Format;
  className?: string;
  caution?: boolean;
  target?: TargetMark;
  /** Shown before the amount (a card register's "!" on its Payment figure). */
  icon?: ReactNode;
}) {
  const sign = amount === "0" ? 0 : amount.startsWith("-") ? -1 : 1;
  // An overspent category shows only its overspending.
  const mark = sign >= 0 ? target : undefined;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 align-middle font-medium text-sm",
        caution
          ? "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-100"
          : [
              sign > 0 && "bg-green-100 text-green-900 dark:bg-green-900/50 dark:text-green-100",
              sign < 0 && "bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-100",
              sign === 0 && "bg-muted text-muted-foreground",
            ],
        className,
      )}
    >
      {mark?.kind === "met" && (
        <CircleCheck className="size-3.5 shrink-0" aria-label="Target met" />
      )}
      {mark?.kind === "underfunded" && <TargetPie percent={mark.percent} />}
      {mark?.kind === "upcoming" && (
        <CalendarDays
          className="size-3.5 shrink-0"
          aria-label="Not enough for upcoming scheduled transactions"
        />
      )}
      {mark?.kind === "snoozed" && (
        // YNAB's "Zz" snooze icon.
        <span
          className="shrink-0 font-semibold text-[0.65rem] leading-none"
          role="img"
          aria-label="Target snoozed"
        >
          z<sup>z</sup>
        </span>
      )}
      {icon}
      <span className="truncate">{format(amount)}</span>
    </span>
  );
}

/** A small ring filled clockwise from the top to `percent` (YNAB's underfunded icon). */
export function TargetPie({ percent, className }: { percent: number; className?: string }) {
  const angle = (Math.min(Math.max(percent, 0), 99.9) / 100) * 2 * Math.PI;
  const x = 8 + 6 * Math.sin(angle);
  const y = 8 - 6 * Math.cos(angle);
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-3.5 shrink-0", className)}
      role="img"
      aria-label={`Target ${percent}% funded`}
    >
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {percent > 0 && (
        <path
          d={`M8 8 L8 2 A6 6 0 ${angle > Math.PI ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`}
          fill="currentColor"
        />
      )}
    </svg>
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
  caution = false,
  target,
  trigger,
}: {
  categoryId: string;
  categoryName: string;
  amount: string;
  format: Format;
  actions: MoveActions;
  caution?: boolean;
  target?: TargetMark;
  /** Opens the popover instead of the pill (a paired loan's Cover Payment). */
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const overspent = amount.startsWith("-");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label={`${overspent ? "Cover" : "Move"} ${categoryName}: ${format(amount)}`}
            className="max-w-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AvailablePill
              amount={amount}
              format={format}
              caution={caution}
              target={target}
              className="hover:brightness-95"
            />
          </button>
        )}
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
  label = "Move",
  submitLabel = "OK",
}: {
  categoryId: string;
  amount: string;
  format: Format;
  actions: MoveActions;
  onDone: () => void;
  /** The amount's label ("Move", or "Assign" in the banner's pop-up). */
  label?: string;
  submitLabel?: string;
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
        <FieldLabel htmlFor="move-amount">{label}</FieldLabel>
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
          label={`${label} to`}
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
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

const ASSIGN_TAB_KEY = "everycent.assignTab";

/**
 * The Ready to Assign banner's Assign button (YNAB, checked 2026-10-12 in "ihni7's Plan"): a
 * pop-up with two tabs, "Auto" (the Auto-Assign options) and "Manually" ("Assign:" filled with all
 * of Ready to Assign, "To:" a category, Cancel / Assign). It opens on the tab used last, which YNAB
 * keeps in the browser.
 */
export function AssignButton({
  readyToAssign,
  format,
  actions,
  auto,
}: {
  readyToAssign: string;
  format: Format;
  actions: MoveActions;
  /** The Auto-Assign options for the rows in view. */
  auto: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(() => {
    try {
      return localStorage.getItem(ASSIGN_TAB_KEY) === "auto" ? "auto" : "manual";
    } catch {
      return "manual";
    }
  });
  const choose = (value: string) => {
    setTab(value);
    try {
      localStorage.setItem(ASSIGN_TAB_KEY, value);
    } catch {
      // Remembering the tab is a convenience.
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" className="bg-green-800 text-white hover:bg-green-900">
          Assign
          <ChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-80">
        <Tabs value={tab} onValueChange={choose}>
          <TabsList className="w-full">
            <TabsTrigger value="auto">
              <Zap />
              Auto
            </TabsTrigger>
            <TabsTrigger value="manual">Manually</TabsTrigger>
          </TabsList>
          <TabsContent value="auto" className="pt-2">
            {auto}
          </TabsContent>
          <TabsContent value="manual" className="pt-2">
            <MoveForm
              categoryId={actions.readyToAssignId}
              amount={readyToAssign}
              format={format}
              actions={actions}
              onDone={() => setOpen(false)}
              label="Assign"
              submitLabel="Assign"
            />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

/** A form that only picks a category to take money from, as YNAB's cover and Fix This do. */
function PickSourceForm({
  label,
  aside,
  options,
  format,
  onCancel,
  onPick,
}: {
  label: string;
  /** Shown next to the label (Fix This's month picker). */
  aside?: ReactNode;
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
        <div className="flex items-center justify-between gap-2">
          <FieldLabel>{label}</FieldLabel>
          {aside}
        </div>
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
 * The months Fix This can un-assign from, as YNAB offers them (checked 2026-10-11): from the
 * current month to the last one with money assigned, months with nothing assigned disabled. The
 * current month offers what's available; later months what's assigned in them.
 */
export interface FixThisMonths {
  months: readonly { month: BudgetMonth; disabled: boolean }[];
  /** Selected at first: the month on screen. */
  initial: BudgetMonth;
  /** The categories to offer in `month`, with what can be taken back; undefined while loading. */
  optionsFor: (month: BudgetMonth) => readonly MoneyOption[] | undefined;
  /** Moves `amount` from a category back to Ready to Assign in `month`. */
  unassign: (month: BudgetMonth, categoryId: string, amount: bigint) => Promise<void>;
}

/**
 * YNAB's "Fix This" on a negative Ready to Assign: takes the shortfall back from one category
 * (as much as it has), in the month on screen or, with `months`, another month YNAB offers.
 */
export function FixThisButton({
  readyToAssign,
  format,
  actions,
  months,
}: {
  readyToAssign: string;
  format: Format;
  actions: MoveActions;
  months?: FixThisMonths;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(months?.initial);
  const picked = months && month ? months.optionsFor(month) : actions.options;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setMonth(months?.initial);
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="destructive">
          Fix This
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PickSourceForm
          key={month}
          label="Un-assign money from"
          aside={
            months &&
            months.months.length > 1 && (
              <NativeSelect
                size="sm"
                aria-label="Month"
                value={month}
                onChange={(e) => setMonth(e.target.value as BudgetMonth)}
              >
                {months.months.map((m) => (
                  <NativeSelectOption key={m.month} value={m.month} disabled={m.disabled}>
                    {monthLabel(m.month)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )
          }
          options={(picked ?? []).filter(
            (o) => o.id !== actions.readyToAssignId && BigInt(o.available) > 0n,
          )}
          format={format}
          onCancel={() => setOpen(false)}
          onPick={async (source) => {
            setOpen(false);
            const amount = minAmount(BigInt(source.available), -BigInt(readyToAssign));
            if (months && month) await months.unassign(month, source.id, amount);
            else await actions.move(source.id, actions.readyToAssignId, amount);
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
