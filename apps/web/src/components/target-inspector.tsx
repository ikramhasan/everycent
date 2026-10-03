import { targetPercent } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { Field, FieldError, FieldLabel } from "@everycent/ui/components/field";
import { Input } from "@everycent/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@everycent/ui/components/native-select";
import { cn } from "@everycent/ui/lib/utils";
import { Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  type CategoryTarget,
  DUE_DAY_OPTIONS,
  type TargetInput,
  type TargetNeed,
  targetDueLine,
  targetHeading,
} from "@/lib/targets";

type Format = (minorUnits: string) => string;

/** YNAB's "Next month I want to" choices, with the help it shows under each. */
const BEHAVIORS = {
  set_aside: { label: "Set aside another", use: "Use for: bills, subscriptions, saving over time" },
  refill: { label: "Refill up to", use: "Use for: gasoline, fun money, dining out" },
} as const;

/** Only monthly targets exist so far; YNAB's other cadences come with phase 8b. */
const CADENCES = ["Weekly", "Monthly", "Yearly", "Custom"] as const;

/**
 * The inspector's Target section (YNAB, checked in its web app on 2026-10-03, docs/verify.md
 * "Monthly targets"): what the target asks for this month and how far along it is, or an invitation
 * to create one. `need` is null before the target's start month, which shows the invitation too.
 */
export function TargetSection({
  name,
  target,
  need,
  format,
  parse,
  toInput,
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
  onSave: (input: TargetInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  /** Assigns what's still to go; undefined when the month can't take money. */
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

  const percent = targetPercent({
    needed: BigInt(need.needed),
    funded: BigInt(need.funded),
    underfunded: BigInt(need.underfunded),
  });
  const met = need.underfunded === "0";
  const setAside = target.behavior === "set_aside";
  return (
    <Section>
      <div className="grid gap-0.5">
        <p className="font-medium text-sm">{targetHeading(target, format(target.amount))}</p>
        <p className="text-muted-foreground text-xs">{targetDueLine(target.dueDay)}</p>
      </div>
      {met ? (
        <p className="text-center font-medium text-sm">You've met your target!</p>
      ) : (
        <>
          <ProgressRing percent={percent} />
          <div className="grid gap-2 rounded-md bg-yellow-100 p-3 text-center text-sm text-yellow-950 dark:bg-yellow-900/40 dark:text-yellow-50">
            <p>
              Assign{" "}
              <span className="rounded bg-yellow-300/70 px-1 font-semibold dark:bg-yellow-700/70">
                {format(need.underfunded)}
                {BigInt(need.funded) > 0n ? " more" : ""}
              </span>{" "}
              to meet your target
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
        </>
      )}
      <dl className="grid gap-1 text-sm">
        <Row
          label={setAside ? "Amount to Assign This Month" : "Needed This Month"}
          value={format(need.needed)}
        />
        <Row label={setAside ? "Assigned So Far" : "Funded"} value={format(need.funded)} />
      </dl>
      <dl className="grid gap-1 border-t pt-2 text-sm">
        <Row label="To Go" value={format(need.underfunded)} />
      </dl>
      <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
        Edit Target
      </Button>
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Target" className="grid gap-3 border-t pt-3">
      <h3 className="font-semibold text-sm">Target</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
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

/** YNAB's target form: cadence, "I need", "By" and "Next month I want to". */
function TargetEditor({
  target,
  format,
  parse,
  toInput,
  onSave,
  onCancel,
  onDelete,
}: {
  target: CategoryTarget | null;
  format: Format;
  parse: (text: string) => bigint | string;
  toInput: (amount: string) => string;
  onSave: (input: TargetInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [amountText, setAmountText] = useState(target ? toInput(target.amount) : "");
  const [dueDay, setDueDay] = useState(target?.dueDay == null ? "last" : String(target.dueDay));
  const [behavior, setBehavior] = useState<TargetInput["behavior"]>(
    target?.behavior ?? "set_aside",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = amountText.trim() === "" ? 0n : parse(amountText);
  const shown = format((typeof parsed === "bigint" ? parsed : 0n).toString());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (typeof parsed === "string") return setError(parsed);
    if (parsed <= 0n) return setError("Enter how much you need.");
    setError(null);
    setBusy(true);
    try {
      await onSave({
        behavior,
        amount: parsed.toString(),
        dueDay: dueDay === "last" ? null : Number(dueDay),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Target" className="grid gap-3 border-t pt-3">
      <h3 className="font-semibold text-sm">Target</h3>
      <form onSubmit={submit} className="grid gap-3">
        <fieldset className="grid grid-cols-4 rounded-lg bg-muted p-0.5 text-xs">
          <legend className="sr-only">How often</legend>
          {CADENCES.map((c) => (
            <button
              key={c}
              type="button"
              disabled={c !== "Monthly"}
              aria-pressed={c === "Monthly"}
              className={cn(
                "rounded-md px-1 py-1",
                c === "Monthly"
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground disabled:opacity-50",
              )}
            >
              {c}
            </button>
          ))}
        </fieldset>
        <Field>
          <FieldLabel htmlFor="target-amount">I need</FieldLabel>
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
        <Field>
          <FieldLabel htmlFor="target-behavior">Next month I want to</FieldLabel>
          <NativeSelect
            id="target-behavior"
            className="w-full"
            value={behavior}
            onChange={(e) => setBehavior(e.target.value as TargetInput["behavior"])}
          >
            {(["set_aside", "refill"] as const).map((b) => (
              <NativeSelectOption key={b} value={b}>
                {BEHAVIORS[b].label} {shown}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-muted-foreground text-xs">{BEHAVIORS[behavior].use}</p>
        </Field>
        <div className="flex items-center gap-2">
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
