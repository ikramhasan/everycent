import { type DateFormat, targetPercent } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { Field, FieldError, FieldLabel } from "@everycent/ui/components/field";
import { Input } from "@everycent/ui/components/input";
import { Label } from "@everycent/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@everycent/ui/components/native-select";
import { Switch } from "@everycent/ui/components/switch";
import { cn } from "@everycent/ui/lib/utils";
import { Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { todayIso } from "@/lib/dates";
import {
  type CategoryTarget,
  DUE_DAY_OPTIONS,
  MONTH_OPTIONS,
  type TargetInput,
  type TargetNeed,
  targetDueLine,
  targetHeading,
  targetLines,
  targetMessage,
  WEEKDAY_OPTIONS,
} from "@/lib/targets";
import { DateField } from "./register-fields";

type Format = (minorUnits: string) => string;
type Cadence = CategoryTarget["cadence"];
type Behavior = CategoryTarget["behavior"];

const CADENCES: { value: Cadence; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

/** YNAB's behaviour choices and their help, per cadence (docs/verify.md). */
const CHOICES = {
  set_aside: { use: "Use for: bills, subscriptions, saving over time" },
  refill: { use: "Use for: gasoline, fun money, dining out" },
  balance: { use: "Use for: long-term savings" },
} as const;

function choiceLabel(cadence: Cadence, behavior: Behavior, amount: string) {
  const perWeek = cadence === "weekly" ? "/week" : "";
  if (behavior === "balance") return `Have a balance of ${amount}`;
  if (cadence === "custom")
    return behavior === "set_aside" ? `Set aside ${amount}` : `Fill up to ${amount}`;
  return behavior === "set_aside"
    ? `Set aside another ${amount}${perWeek}`
    : `Refill up to ${amount}${perWeek}`;
}

/**
 * The inspector's Target section (YNAB, checked in its web app on 2026-10-03, docs/verify.md
 * "Monthly targets" and "Weekly, yearly and custom targets"): what the target asks for this month
 * and how far along it is, or an invitation to create one. `need` is null before the target's start
 * month (and after a one-time target's due month), which shows the invitation too.
 */
export function TargetSection({
  name,
  target,
  need,
  format,
  parse,
  toInput,
  dateFormat,
  onSave,
  onDelete,
  onAssign,
}: {
  name: string;
  target: CategoryTarget | null;
  need: TargetNeed | null;
  format: Format;
  parse: (text: string) => bigint | string;
  toInput: (amount: string) => string;
  dateFormat: DateFormat;
  onSave: (input: TargetInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  /** Assigns what's still to go this month; undefined when the month can't take money. */
  onAssign?: (amount: bigint) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <TargetEditor
        target={target}
        format={format}
        parse={parse}
        toInput={toInput}
        dateFormat={dateFormat}
        onCancel={() => setEditing(false)}
        onSave={async (input) => {
          if (await onSave(input)) setEditing(false);
        }}
        onDelete={
          target
            ? async () => {
                if (await onDelete()) setEditing(false);
              }
            : undefined
        }
      />
    );
  }
  if (!target || !need) {
    return (
      <Section>
        <p className="font-medium text-sm">How much do you need for {name}?</p>
        <p className="text-muted-foreground text-sm">
          When you create a target, we'll let you know how much money to set aside to stay on track
          over time.
        </p>
        <Button size="sm" variant="secondary" className="w-fit" onClick={() => setEditing(true)}>
          Create Target
        </Button>
      </Section>
    );
  }

  const percent = targetPercent({ needed: BigInt(need.needed), funded: BigInt(need.funded) });
  const message = targetMessage(target, need, format);
  const met = BigInt(need.funded) >= BigInt(need.needed);
  return (
    <Section>
      <div className="grid gap-0.5">
        <p className="font-medium text-sm">{targetHeading(target, format(target.amount))}</p>
        <p className="text-muted-foreground text-xs">{targetDueLine(target, need)}</p>
      </div>
      {!met && <ProgressRing percent={percent} />}
      {message && "text" in message && (
        <p className="text-center font-medium text-sm">{message.text}</p>
      )}
      {message && "prompt" in message && (
        <div className="grid gap-2 rounded-md bg-yellow-100 p-3 text-center text-sm text-yellow-950 dark:bg-yellow-900/40 dark:text-yellow-50">
          <p>
            Assign{" "}
            <span className="rounded bg-yellow-300/70 px-1 font-semibold dark:bg-yellow-700/70">
              {message.prompt}
            </span>
            {message.suffix}
          </p>
          {onAssign && (
            <Button
              size="sm"
              className="bg-yellow-400 text-yellow-950 hover:bg-yellow-500"
              onClick={() => onAssign(BigInt(need.underfunded))}
            >
              Assign
            </Button>
          )}
        </div>
      )}
      <dl className="grid gap-1 text-sm">
        {targetLines(target, need, format).map((line) => (
          <Row
            key={line.label}
            label={line.label}
            value={line.value}
            className={line.label === "To Go" ? "border-t pt-2" : undefined}
          />
        ))}
      </dl>
      <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
        Edit Target
      </Button>
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Target" className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t pt-3">
      <h3 className="font-semibold text-sm">Target</h3>
      {children}
    </section>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** YNAB's progress ring with the funded percentage in the middle. */
function ProgressRing({ percent }: { percent: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto size-16">
      <svg
        viewBox="0 0 64 64"
        className="size-16 -rotate-90"
        role="img"
        aria-label={`${percent}% of the target funded`}
      >
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
          className="stroke-yellow-400"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-semibold text-sm">
        {percent}%
      </span>
    </div>
  );
}

/** The first of next month, YNAB's default due date for a new dated target. */
function firstOfNextMonth() {
  const [y, m] = todayIso().split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** YNAB's target form: Weekly, Monthly, Yearly or Custom, with each tab's own fields. */
function TargetEditor({
  target,
  format,
  parse,
  toInput,
  dateFormat,
  onSave,
  onCancel,
  onDelete,
}: {
  target: CategoryTarget | null;
  format: Format;
  parse: (text: string) => bigint | string;
  toInput: (amount: string) => string;
  dateFormat: DateFormat;
  onSave: (input: TargetInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const nextMonth = firstOfNextMonth();
  const [cadence, setCadence] = useState<Cadence>(target?.cadence ?? "monthly");
  const [amountText, setAmountText] = useState(target ? toInput(target.amount) : "");
  const [behavior, setBehavior] = useState<Behavior>(target?.behavior ?? "set_aside");
  // Monthly: "last" or a day; weekly: a weekday (today's by default, as YNAB).
  const [dueDay, setDueDay] = useState(
    target?.cadence === "monthly" && target.dueDay !== null ? String(target.dueDay) : "last",
  );
  const [weekday, setWeekday] = useState(
    target?.cadence === "weekly" ? (target.dueDay ?? 0) : new Date().getDay(),
  );
  const [dueDate, setDueDate] = useState(target?.dueDate ?? nextMonth);
  const [repeat, setRepeat] = useState(target ? target.repeatEvery !== null : true);
  const [repeatEvery, setRepeatEvery] = useState(target?.repeatEvery ?? 1);
  const [repeatUnit, setRepeatUnit] = useState<"month" | "year">(target?.repeatUnit ?? "month");
  const [byDate, setByDate] = useState(target?.behavior === "balance" && target.dueDate !== null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = amountText.trim() === "" ? 0n : parse(amountText);
  const shown = format((typeof parsed === "bigint" ? parsed : 0n).toString());
  // Balance is a custom-only choice; leaving Custom falls back to Set aside.
  const choice: Behavior = cadence !== "custom" && behavior === "balance" ? "set_aside" : behavior;
  const choices: Behavior[] =
    cadence === "custom" ? ["set_aside", "refill", "balance"] : ["set_aside", "refill"];

  function input(amount: string): TargetInput {
    switch (cadence) {
      case "weekly":
        return { cadence, behavior: choice as "set_aside", amount, dueDay: weekday };
      case "monthly":
        return {
          cadence,
          behavior: choice as "set_aside",
          amount,
          dueDay: dueDay === "last" ? null : Number(dueDay),
        };
      case "yearly":
        return { cadence, behavior: choice as "set_aside", amount, dueDate };
      default:
        return choice === "balance"
          ? { cadence, behavior: choice, amount, dueDate: byDate ? dueDate : null, repeat: null }
          : {
              cadence,
              behavior: choice,
              amount,
              dueDate,
              repeat: repeat ? { every: repeatEvery, unit: repeatUnit } : null,
            };
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (typeof parsed === "string") return setError(parsed);
    if (parsed <= 0n) return setError("Enter how much you need.");
    setError(null);
    setBusy(true);
    try {
      await onSave(input(parsed.toString()));
    } finally {
      setBusy(false);
    }
  }

  const behaviorLabel =
    cadence === "weekly" || cadence === "monthly"
      ? "Next month I want to"
      : cadence === "yearly"
        ? "Next year I want to"
        : "I want to";
  const dateValue = choice === "balance" ? dueDate.slice(0, 7) : dueDate;
  const [dueYear, dueMonth] = dateValue.split("-").map(Number) as [number, number];
  const thisYear = Number(todayIso().slice(0, 4));

  return (
    <section aria-label="Target" className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t pt-3">
      <h3 className="font-semibold text-sm">Target</h3>
      <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <fieldset className="grid min-w-0 grid-cols-4 rounded-lg bg-muted p-0.5 text-xs">
          <legend className="sr-only">How often</legend>
          {CADENCES.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={c.value === cadence}
              onClick={() => setCadence(c.value)}
              className={cn(
                "rounded-md px-1 py-1",
                c.value === cadence
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </fieldset>
        <Field>
          <FieldLabel htmlFor="target-amount">
            {cadence === "custom" ? "Amount" : "I need"}
          </FieldLabel>
          <Input
            id="target-amount"
            autoFocus
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        {cadence === "weekly" && (
          <Field>
            <FieldLabel htmlFor="target-weekday">Every</FieldLabel>
            <NativeSelect
              id="target-weekday"
              className="w-full"
              value={String(weekday)}
              onChange={(e) => setWeekday(Number(e.target.value))}
            >
              {WEEKDAY_OPTIONS.map((o) => (
                <NativeSelectOption key={o.value} value={o.value}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
        {cadence === "monthly" && (
          <Field>
            <FieldLabel htmlFor="target-due">By</FieldLabel>
            <NativeSelect
              id="target-due"
              className="w-full"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
            >
              {DUE_DAY_OPTIONS.map((o) => (
                <NativeSelectOption key={o.value} value={o.value}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
        {cadence === "yearly" && (
          <Field>
            <FieldLabel>By</FieldLabel>
            <div className="min-w-0 [&_input]:min-w-0">
              <DateField value={dueDate} onChange={setDueDate} format={dateFormat} />
            </div>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="target-behavior">{behaviorLabel}</FieldLabel>
          <NativeSelect
            id="target-behavior"
            className="w-full"
            value={choice}
            onChange={(e) => setBehavior(e.target.value as Behavior)}
          >
            {choices.map((b) => (
              <NativeSelectOption key={b} value={b}>
                {choiceLabel(cadence, b, shown)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-muted-foreground text-xs">{CHOICES[choice].use}</p>
        </Field>
        {cadence === "custom" && choice !== "balance" && (
          <>
            <Field>
              <FieldLabel>Due on</FieldLabel>
              <div className="min-w-0 [&_input]:min-w-0">
                <DateField value={dueDate} onChange={setDueDate} format={dateFormat} />
              </div>
            </Field>
            <div className="flex items-center gap-2 text-sm">
              <Switch id="target-repeat-on" checked={repeat} onCheckedChange={setRepeat} />
              <Label htmlFor="target-repeat-on">Repeat</Label>
            </div>
            {repeat && (
              <Field>
                <FieldLabel htmlFor="target-repeat">Every</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <NativeSelect
                    id="target-repeat"
                    className="w-full"
                    value={String(repeatEvery)}
                    onChange={(e) => setRepeatEvery(Number(e.target.value))}
                  >
                    {Array.from({ length: repeatUnit === "year" ? 2 : 11 }, (_, i) => i + 1).map(
                      (n) => (
                        <NativeSelectOption key={n} value={n}>
                          {n}
                        </NativeSelectOption>
                      ),
                    )}
                  </NativeSelect>
                  <NativeSelect
                    aria-label="Month or year"
                    className="w-full"
                    value={repeatUnit}
                    onChange={(e) => {
                      const unit = e.target.value as "month" | "year";
                      setRepeatUnit(unit);
                      if (unit === "year" && repeatEvery > 2) setRepeatEvery(1);
                    }}
                  >
                    <NativeSelectOption value="month">Month</NativeSelectOption>
                    <NativeSelectOption value="year">Year</NativeSelectOption>
                  </NativeSelect>
                </div>
              </Field>
            )}
          </>
        )}
        {cadence === "custom" && choice === "balance" && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <Switch id="target-by-date" checked={byDate} onCheckedChange={setByDate} />
              <Label htmlFor="target-by-date">Due by date</Label>
            </div>
            {byDate && (
              <Field>
                <FieldLabel htmlFor="target-balance-month">Due on</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <NativeSelect
                    id="target-balance-month"
                    className="w-full"
                    value={String(dueMonth)}
                    onChange={(e) => setDueDate(`${dueYear}-${e.target.value.padStart(2, "0")}-01`)}
                  >
                    {MONTH_OPTIONS.map((o) => (
                      <NativeSelectOption key={o.value} value={o.value}>
                        {o.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    aria-label="Year"
                    className="w-full"
                    value={String(dueYear)}
                    onChange={(e) =>
                      setDueDate(`${e.target.value}-${String(dueMonth).padStart(2, "0")}-01`)
                    }
                  >
                    {/* YNAB lists this year and the next 49. */}
                    {Array.from({ length: 50 }, (_, i) => thisYear + i).map((y) => (
                      <NativeSelectOption key={y} value={y}>
                        {y}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              </Field>
            )}
          </>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 /> Delete
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            Save Target
          </Button>
        </div>
      </form>
    </section>
  );
}
