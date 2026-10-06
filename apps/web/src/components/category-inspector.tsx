import { addMonths } from "@everycent/engine";
import { Textarea } from "@everycent/ui/components/textarea";
import { cn } from "@everycent/ui/lib/utils";
import { type ReactNode, useEffect, useState } from "react";
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
   * What the plan's targets ask of this month and the next (YNAB's "Cost to Be Me"), shown in the
   * current month only, as YNAB does.
   */
  targets?: { month: bigint; nextMonth: bigint };
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
          <dl className="grid gap-2">
            <Line label={`${name}’s Targets`} value={targets.month} format={format} />
          </dl>
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
 * where the money came from. "Cover Overspent Categories" and Debt Payoff Targets aren't built.
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
}) {
  const f = (n: bigint) => format(n.toString());
  const rest = payment.underfunded - payment.overspentCategories;
  return (
    <Panel label={`${name} inspector`}>
      <h2 className="truncate font-semibold">{name}</h2>
      <section aria-label="Payment" className="grid gap-1 text-sm">
        <h3 className="font-semibold">Payment</h3>
        {totals.available < 0n ? (
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
      <dl className="grid gap-2">
        <Line label="Current Balance" value={payment.balance} format={format} />
        <Line label="Prior Balance" value={payment.priorBalance} format={format} />
        <Line label="Spending and Outflows" value={payment.spendingAndOutflows} format={format} />
        <Line label="Payments and Inflows" value={payment.paymentsAndInflows} format={format} />
      </dl>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">Available for Payment</span>
        {available}
      </div>
      <dl className="grid gap-2">
        <Line label="Cash Left Over From Last Month" value={totals.carried} format={format} />
        <Line label="Assigned" value={totals.assigned} format={format} />
        <Line label="Funded Spending" value={payment.fundedSpending} format={format} />
        <Line label="Payments Made" value={payment.paymentsMade} format={format} />
      </dl>
      <NoteField key={name} note={note} onChange={onNoteChange} />
    </Panel>
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
