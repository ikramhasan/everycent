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
    <section aria-label={label} className="grid gap-3 rounded-lg border p-4">
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
}: {
  month: string;
  totals: Breakdown;
  format: Format;
  /** Names of the selected categories, when two or more are. */
  selectedNames?: string[];
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
    </Panel>
  );
}

/**
 * The inspector for one category: where its Available comes from (activity split into what was
 * paid with cash and with credit accounts), and its note.
 */
export function CategoryInspector({
  name,
  totals,
  format,
  available,
  note,
  onNoteChange,
  uncategorized = false,
}: {
  name: string;
  totals: Breakdown;
  format: Format;
  /** The Available pill (it opens the move and cover popovers). */
  available: ReactNode;
  note: string;
  onNoteChange: (note: string) => Promise<void>;
  uncategorized?: boolean;
}) {
  const overspent = totals.available < 0n;
  const shortfall = format((-totals.available).toString());
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
        <p className="text-destructive text-sm">
          {uncategorized
            ? `Uncategorized cash transactions still affect your plan! Assign them to categories or ${shortfall} will be deducted from the amount you have available to assign next month.`
            : `You've overspent this category by ${shortfall}. Cover this overspending or you can't trust your plan balances!`}
        </p>
      )}
      {!uncategorized && <NoteField key={name} note={note} onChange={onNoteChange} />}
    </Panel>
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
