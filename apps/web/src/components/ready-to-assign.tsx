import { addMonths } from "@everycent/engine";
import { cn } from "@everycent/ui/lib/utils";
import { CircleCheck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { type BudgetMonthData, monthName } from "@/lib/months";

/**
 * YNAB's Ready to Assign banner: green with money to assign, grey once it's all assigned, red when
 * it's negative: "You assigned more than you have" (with Fix This) while categories could cover it,
 * "Overdraft? We can help with that!" once even their cash couldn't (the API's `overdraft`).
 */
export function ReadyToAssignBanner({
  amount,
  overdraft,
  format,
  action,
}: {
  amount: string;
  overdraft: boolean;
  format: (minorUnits: string) => string;
  /** A button for money assigned beyond what there is (YNAB's "Fix This"). */
  action?: ReactNode;
}) {
  const sign = amount === "0" ? 0 : amount.startsWith("-") ? -1 : 1;
  const negativeLabel = overdraft
    ? "Overdraft? We can help with that!"
    : "You assigned more than you have";
  return (
    <output
      aria-live="polite"
      className={cn(
        "flex min-w-56 items-center justify-between gap-3 rounded-lg px-4 py-2",
        sign > 0 && "bg-green-200 text-green-950 dark:bg-green-900/60 dark:text-green-50",
        sign === 0 && "bg-muted text-muted-foreground",
        sign < 0 && "bg-red-200 text-red-950 dark:bg-red-900/60 dark:text-red-50",
      )}
    >
      <span className="grid">
        <span className="font-semibold text-2xl tabular-nums">{format(amount)}</span>
        <span className="text-sm">
          {sign > 0 ? "Ready to Assign" : sign === 0 ? "All Money Assigned" : negativeLabel}
        </span>
      </span>
      {sign === 0 && <CircleCheck className="size-6" aria-hidden />}
      {sign < 0 && !overdraft && action}
    </output>
  );
}

/**
 * YNAB's "Assigned in Future Months" panel: what later months already hold, by month. YNAB shows
 * it in the current month and lists the next month even when nothing is assigned there. When a
 * later month is over-assigned the heading gets a warning sign and a red line names the first such
 * month (YNAB, 2026-10-12, "C5 First FS": "Ready to Assign in November is −$50.00").
 */
export function FutureMonthsPanel({
  data,
  format,
}: {
  data: BudgetMonthData;
  format: (minorUnits: string) => string;
}) {
  const months = data.futureMonths.length
    ? data.futureMonths
    : [{ month: addMonths(data.month, 1), assigned: "0" }];
  return (
    <section aria-label="Assigned in Future Months" className="grid gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2 font-semibold text-sm">
        <h2 className="flex items-center gap-1.5">
          {data.futureShortfall && (
            <TriangleAlert className="size-4 shrink-0" aria-label="A later month is short" />
          )}
          Assigned in Future Months
        </h2>
        <span className="tabular-nums">{format(data.assignedInFuture)}</span>
      </div>
      {data.futureShortfall && (
        <p className="rounded-md bg-red-100 px-3 py-1.5 text-center text-red-950 text-sm dark:bg-red-900/40 dark:text-red-50">
          Ready to Assign in {monthName(data.futureShortfall.month)} is{" "}
          {format(data.futureShortfall.readyToAssign)}
        </p>
      )}
      <ul className="grid gap-1 text-sm">
        {months.map((m) => (
          <li key={m.month} className="flex justify-between gap-2">
            <span>{monthName(m.month)}</span>
            <span className="tabular-nums">{format(m.assigned)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
