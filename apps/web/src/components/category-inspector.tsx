import { addMonths } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@everycent/ui/components/collapsible";
import { Input } from "@everycent/ui/components/input";
import { Textarea } from "@everycent/ui/components/textarea";
import { cn } from "@everycent/ui/lib/utils";
import { ChevronDown, ChevronRight, SquarePen } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { Breakdown } from "@/lib/budget-view";
import { monthName } from "@/lib/months";

type Format = (minorUnits: string) => string;

/** A line of the breakdown; `value` null shows YNAB's dash (Uncategorized can't hold money). */
function Line({
  label,
  value,
  format,
  hint,
}: {
  label: string;
  value: bigint | null;
  format: Format;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm" title={hint}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value === null ? "–" : format(value.toString())}</dd>
    </div>
  );
}

function Panel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section
      aria-label={label}
      className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border p-4"
    >
      {children}
    </section>
  );
}

/**
 * The inspector with nothing (or several categories) selected: YNAB's month summary, added up
 * over the rows in view or the selection.
 */
export function MonthSummary({
  month,
  totals,
  format,
  selectedNames,
  targets,
}: {
  month: string;
  totals: Breakdown;
  format: Format;
  /** Names of the selected categories, when two or more are. */
  selectedNames?: string[];
  /**
   * What the plan's targets ask of this month and the next (YNAB's "Cost to Be Me"), with the
   * budget's expected income; shown in the current month only, as YNAB does.
   */
  targets?: {
    month: bigint;
    nextMonth: bigint;
    expectedIncome: bigint | null;
    /** Saves the expected income; undefined when the user can't (no editor then). */
    onSetIncome?: (amount: bigint) => Promise<boolean>;
    parse?: (text: string) => bigint | string;
    toInput?: (amount: string) => string;
  };
}) {
  const previous = monthName(addMonths(month, -1));
  const name = monthName(month);
  return (
    <Panel label={selectedNames ? "Selected categories" : `${name}'s Summary`}>
      {selectedNames && (
        <div className="grid gap-1">
          <h2 className="font-semibold">{selectedNames.length} Categories Selected</h2>
          <p className="text-muted-foreground text-xs">{selectedNames.join(", ")}</p>
        </div>
      )}
      <h3 className="font-semibold text-sm">{name}'s Summary</h3>
      <dl className="grid gap-2">
        <Line
          label="Left Over from Last Month"
          value={totals.carried}
          format={format}
          hint={`The total amount of money you have left over from ${previous}.`}
        />
        <Line
          label={`Assigned in ${name}`}
          value={totals.assigned}
          format={format}
          hint={`The total amount of money you have assigned in ${name}.`}
        />
        <Line
          label="Activity"
          value={totals.activity}
          format={format}
          hint={`The total amount of activity (e.g. spending) in ${name}.`}
        />
        <Line
          label="Available"
          value={totals.available}
          format={format}
          hint={`The total amount of money you have available in ${name}.`}
        />
      </dl>
      {targets && (
        <>
          <h3 className="font-semibold text-sm">Cost to Be Me</h3>
          <CostToBeMe name={name} targets={targets} format={format} />
          {/* YNAB showed this line whenever next month's total was higher; equal or lower wasn't seen. */}
          {targets.nextMonth > targets.month && (
            <p className="rounded-md bg-muted p-2 text-center text-muted-foreground text-xs">
              Next month's targets could increase your total to{" "}
              {format(targets.nextMonth.toString())}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

/** Bar width for `part` of `whole`, as a CSS percentage capped at 100%. */
const barWidth = (part: bigint, whole: bigint) =>
  whole <= 0n || part >= whole ? "100%" : `${Number((part * 10000n) / whole) / 100}%`;

/**
 * YNAB's Cost to Be Me (seen 2026-10-08, docs/verify.md "Targets overview and history"): the
 * month's targets and, once entered, the expected income, each with a bar against the larger of
 * the two. The targets bar is blue while the income covers them and red when it falls short;
 * the income bar is grey. "Enter your expected income" opens an amount field; zero leaves it as
 * it was (YNAB can't clear it).
 */
function CostToBeMe({
  name,
  targets,
  format,
}: {
  name: string;
  targets: NonNullable<Parameters<typeof MonthSummary>[0]["targets"]>;
  format: Format;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const income = targets.expectedIncome;
  const { onSetIncome, parse, toInput } = targets;
  const short = income !== null && targets.month > income;

  function open() {
    setText(income !== null && toInput ? toInput(income.toString()) : "0.00");
    setEditing(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const amount = parse && text.trim() !== "" ? parse(text) : 0n;
    if (typeof amount === "string" || amount <= 0n || !onSetIncome) return setEditing(false);
    setBusy(true);
    try {
      if (await onSetIncome(amount)) setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <dl className="grid gap-1">
        <Line label={`${name}’s Targets`} value={targets.month} format={format} />
        {income !== null && (
          <div
            role="img"
            aria-label={short ? "Targets are more than the expected income" : "Targets"}
            className={cn(
              "h-1 rounded-full",
              short ? "bg-linear-to-r from-red-400 to-red-700" : "bg-blue-600 dark:bg-blue-500",
            )}
            style={{ width: barWidth(targets.month, income) }}
          />
        )}
      </dl>
      {editing ? (
        <form onSubmit={save} className="grid gap-2">
          <label htmlFor="expected-income" className="font-semibold text-sm">
            Expected Income
          </label>
          <Input
            id="expected-income"
            autoFocus
            inputMode="decimal"
            value={text}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              Save
            </Button>
          </div>
        </form>
      ) : income !== null ? (
        <div className="grid gap-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Expected Income</span>
            <span className="flex items-center gap-1 tabular-nums">
              {format(income.toString())}
              {onSetIncome && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label="Edit your income"
                  onClick={open}
                >
                  <SquarePen className="size-3.5" />
                </Button>
              )}
            </span>
          </div>
          <div
            role="img"
            aria-label="Expected income"
            className="h-1 rounded-full bg-muted-foreground/30"
            style={{ width: barWidth(income, targets.month) }}
          />
        </div>
      ) : (
        onSetIncome && (
          <Button size="sm" variant="secondary" onClick={open}>
            Enter your expected income
          </Button>
        )
      )}
    </div>
  );
}

/**
 * The inspector for one category: where its Available comes from (activity split into what was
 * paid with cash and with credit accounts), its target, and its note.
 */
export function CategoryInspector({
  name,
  totals,
  format,
  available,
  note,
  onNoteChange,
  uncategorized = false,
  target,
}: {
  name: string;
  totals: Breakdown;
  format: Format;
  /** The Available pill (it opens the move and cover popovers). */
  available: ReactNode;
  note: string;
  onNoteChange: (note: string) => Promise<void>;
  uncategorized?: boolean;
  /** The Target section. */
  target?: ReactNode;
}) {
  const overspent = totals.available < 0n;
  const shortfall = format((-totals.available).toString());
  const cashShortfall = format((-totals.cashOverspent).toString());
  return (
    <Panel label={`${name} inspector`}>
      <h2 className="truncate font-semibold">{name}</h2>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">Available Balance</span>
        {available}
      </div>
      <dl className="grid gap-2">
        <Line
          label="Cash Left Over From Last Month"
          value={uncategorized ? null : totals.carried}
          format={format}
        />
        <Line
          label="Assigned This Month"
          value={uncategorized ? null : totals.assigned}
          format={format}
        />
        <Line label="Cash Spending" value={totals.cashActivity} format={format} />
        <Line label="Credit Spending" value={totals.creditActivity} format={format} />
      </dl>
      {overspent && (
        <OverspentMessage
          totals={totals}
          uncategorized={uncategorized}
          {...{ shortfall, cashShortfall }}
        />
      )}
      {target}
      {!uncategorized && <NoteField key={name} note={note} onChange={onNoteChange} />}
    </Panel>
  );
}

export interface PaymentFigures {
  /** The card's working balance (negative: owed). */
  balance: bigint;
  /** Its balance before the month, and the month's outflows (negative) and inflows. */
  priorBalance: bigint;
  spendingAndOutflows: bigint;
  paymentsAndInflows: bigint;
  /** What's owed beyond Available (YNAB's Total Underfunded). */
  underfunded: bigint;
  /** The part of underfunded from this month's credit overspending. */
  overspentCategories: bigint;
  /** Money moved in for funded spending, less returns. */
  fundedSpending: bigint;
  /** The month's payments, negative. */
  paymentsMade: bigint;
}

/**
 * The inspector for a credit card's payment category (YNAB's "Payment" panel, checked in its web
 * app on 2026-10-03): whether Available covers the balance, the Total Underfunded split into this
 * month's overspent categories and the rest, then Current Balance and Available for Payment with
 * where the money came from. With a target that applies, `target` (the Target section) takes the
 * alert's place (YNAB, 2026-10-08). In a past month YNAB shows neither the alert nor Current
 * Balance (Card R6, 2026-10-11).
 */
export function PaymentInspector({
  name,
  totals,
  payment,
  format,
  available,
  note,
  onNoteChange,
  warn,
  past = false,
  target,
  onCoverOverspent,
}: {
  name: string;
  totals: Breakdown;
  payment: PaymentFigures;
  format: Format;
  available: ReactNode;
  note: string;
  onNoteChange: (note: string) => Promise<void>;
  /** YNAB only shows the Underfunded alert from the current month on. */
  warn: boolean;
  /** A month before the current one (no alert, no Current Balance). */
  past?: boolean;
  /** "Cover Overspent Categories": shows the Overspent view. */
  onCoverOverspent?: () => void;
  /** The Target section, which shows the alert itself when no target applies. */
  target?: ReactNode;
}) {
  return (
    <Panel label={`${name} inspector`}>
      <h2 className="truncate font-semibold">{name}</h2>
      {target ??
        (!past && <PaymentAlert {...{ name, totals, payment, format, warn, onCoverOverspent }} />)}
      {!past && (
        <FoldingSection
          storageKey="current-balance"
          title="Current Balance"
          value={<span className="tabular-nums">{format(payment.balance.toString())}</span>}
        >
          <Line label="Prior Balance" value={payment.priorBalance} format={format} />
          <ActivityHeading />
          <Line label="Spending and Outflows" value={payment.spendingAndOutflows} format={format} />
          <Line label="Payments and Inflows" value={payment.paymentsAndInflows} format={format} />
        </FoldingSection>
      )}
      <FoldingSection
        storageKey="available-for-payment"
        title="Available for Payment"
        value={available}
      >
        <Line label="Cash Left Over From Last Month" value={totals.carried} format={format} />
        <ActivityHeading />
        <Line label="Assigned" value={totals.assigned} format={format} />
        <Line label="Funded Spending" value={payment.fundedSpending} format={format} />
        <Line label="Payments Made" value={payment.paymentsMade} format={format} />
      </FoldingSection>
      <NoteField key={name} note={note} onChange={onNoteChange} />
    </Panel>
  );
}

function ActivityHeading() {
  return <dt className="pt-1 font-medium text-sm">Activity This Month</dt>;
}

/** YNAB keeps the payment inspector's folded sections in the browser, for every plan. */
const FOLD_PREFIX = "everycent:inspector-folded:";

function readFolded(key: string) {
  try {
    return localStorage.getItem(FOLD_PREFIX + key) === "true";
  } catch {
    return false;
  }
}

/**
 * A payment inspector section that folds to its title and total, as YNAB's Current Balance and
 * Available for Payment do (checked 2026-10-11; YNAB remembers it in localStorage).
 */
function FoldingSection({
  storageKey,
  title,
  value,
  children,
}: {
  storageKey: string;
  title: string;
  value: ReactNode;
  children: ReactNode;
}) {
  const [folded, setFolded] = useState(() => readFolded(storageKey));
  function toggle(open: boolean) {
    setFolded(!open);
    try {
      if (open) localStorage.removeItem(FOLD_PREFIX + storageKey);
      else localStorage.setItem(FOLD_PREFIX + storageKey, "true");
    } catch {
      // Blocked storage: it folds until the page closes.
    }
  }
  return (
    <Collapsible open={!folded} onOpenChange={toggle} className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger className="flex items-center gap-1 whitespace-nowrap rounded-sm text-left font-medium text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {title}
          {folded ? (
            <ChevronRight className="size-4" aria-hidden />
          ) : (
            <ChevronDown className="size-4" aria-hidden />
          )}
        </CollapsibleTrigger>
        {value}
      </div>
      <CollapsibleContent asChild>
        <dl className="grid gap-2">{children}</dl>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * YNAB's Payment alert: the payment was more than was set aside (red), this month's overspent
 * categories or the rest of the balance still to cover, or the card paid off. While the balance
 * isn't covered it offers "Create a Debt Payoff Target" (`onCreateTarget`), then Total
 * Underfunded with its parts.
 */
export function PaymentAlert({
  name,
  totals,
  payment,
  format,
  warn,
  onCreateTarget,
  onCoverOverspent,
}: {
  name: string;
  totals: Pick<Breakdown, "available">;
  payment: PaymentFigures;
  format: Format;
  warn: boolean;
  onCreateTarget?: () => void;
  /** YNAB's "Cover Overspent Categories": switches the budget to the Overspent view. */
  onCoverOverspent?: () => void;
}) {
  const f = (n: bigint) => format(n.toString());
  const rest = payment.underfunded - payment.overspentCategories;
  const overpaid = totals.available < 0n;
  return (
    <>
      <section aria-label="Payment" className="grid gap-2 text-sm">
        <h3 className="font-semibold">Payment</h3>
        {overpaid ? (
          <p className="text-destructive">
            You sent more to {name} than you had set aside for the payment.
          </p>
        ) : warn && payment.overspentCategories > 0n ? (
          <p>
            <span className="font-medium">Overspent Categories.</span> Cover{" "}
            {f(payment.overspentCategories)} in overspent categories in order to pay off your
            current balance.
          </p>
        ) : warn && payment.underfunded > 0n ? (
          <p>
            <span className="font-medium">Underfunded.</span> You need to assign{" "}
            {f(payment.underfunded)} more to pay off your current balance.
          </p>
        ) : payment.balance >= 0n ? (
          <p>Your {name} is paid off! Being debt free is a wonderful thing.</p>
        ) : null}
        {!overpaid && warn && payment.overspentCategories > 0n && onCoverOverspent && (
          // YNAB, 2026-10-11: one click, no money moves; it shows the Overspent view.
          <Button size="sm" onClick={onCoverOverspent}>
            Cover Overspent Categories
          </Button>
        )}
        {!overpaid && warn && payment.underfunded > 0n && onCreateTarget && (
          <>
            <p className="text-center text-muted-foreground">
              {payment.overspentCategories > 0n
                ? "Can't cover the overspent categories?"
                : "Don't have more money to assign?"}
            </p>
            <Button size="sm" variant="secondary" onClick={onCreateTarget}>
              Create a Debt Payoff Target
            </Button>
          </>
        )}
      </section>
      {warn && payment.underfunded > 0n && (
        <dl className="grid gap-2">
          <Line label="Total Underfunded" value={payment.underfunded} format={format} />
          {payment.overspentCategories > 0n && (
            <Line
              label="Overspent Categories"
              value={payment.overspentCategories}
              format={format}
            />
          )}
          {payment.overspentCategories > 0n && rest > 0n && (
            <Line label="Underfunded" value={rest} format={format} />
          )}
        </dl>
      )}
    </>
  );
}

/**
 * YNAB's overspending message, by kind (checked in its web app on 2026-10-03): cash only, credit
 * only ("…with credit. Cover this overspending to avoid creating debt!") or both ("…with cash and
 * credit. Add at least $1.00 …", the cash part). Uncategorized quotes only its cash part.
 */
function OverspentMessage({
  totals,
  uncategorized,
  shortfall,
  cashShortfall,
}: {
  totals: Breakdown;
  uncategorized: boolean;
  shortfall: string;
  cashShortfall: string;
}) {
  const cash = totals.cashOverspent < 0n;
  const credit = totals.creditOverspent < 0n;
  if (uncategorized) {
    if (!cash) return null;
    return (
      <p className="text-destructive text-sm">
        {`Uncategorized cash transactions still affect your plan! Assign them to categories or ${cashShortfall} will be deducted from the amount you have available to assign next month.`}
      </p>
    );
  }
  if (cash && credit) {
    return (
      <p className="text-destructive text-sm">
        {`You've overspent this category by ${shortfall} with cash and credit. Add at least ${cashShortfall} to this category or you can't trust your plan balances!`}
      </p>
    );
  }
  if (credit) {
    return (
      <p className="text-sm text-yellow-800 dark:text-yellow-200">
        {`You've overspent this category by ${shortfall} with credit. Cover this overspending to avoid creating debt!`}
      </p>
    );
  }
  return (
    <p className="text-destructive text-sm">
      {`You've overspent this category by ${shortfall}. Cover this overspending or you can't trust your plan balances!`}
    </p>
  );
}

/** YNAB's Notes: click to type, saved when you click away. */
function NoteField({
  note,
  onChange,
}: {
  note: string;
  onChange: (note: string) => Promise<void>;
}) {
  const [text, setText] = useState(note);
  useEffect(() => setText(note), [note]);
  return (
    <div className="grid gap-1.5">
      <label htmlFor="category-note" className="font-semibold text-sm">
        Notes
      </label>
      <Textarea
        id="category-note"
        value={text}
        placeholder="Enter a note..."
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== note) void onChange(text);
        }}
        className={cn("min-h-16 resize-y text-sm")}
      />
    </div>
  );
}
