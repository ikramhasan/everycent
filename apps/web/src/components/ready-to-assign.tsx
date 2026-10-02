import { addMonths, type BudgetMonth } from "@everycent/engine";
import { cn } from "@everycent/ui/lib/utils";
import { CircleCheck } from "lucide-react";
import { type BudgetMonthData, monthName } from "@/lib/months";

/**
 * YNAB's Ready to Assign banner: green with money to assign, grey once it's all assigned, red when
 * more was assigned than there is.
 */
export function ReadyToAssignBanner({
  month,
  current,
  amount,
  format,
}: {
  month: BudgetMonth;
  current: BudgetMonth;
  amount: string;
  format: (minorUnits: string) => string;
}) {
  const sign = amount === "0" ? 0 : amount.startsWith("-") ? -1 : 1;
  // YNAB's wording for a negative month differs between a past month and the current one; which
  // rule decides it is open in docs/verify.md.
  const negativeLabel = month < current ? "Overdraft?" : "You assigned more than you have";
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
    </output>
  );
}

/**
 * YNAB's "Assigned in Future Months" panel: what later months already hold, by month. YNAB shows
 * it in the current month and lists the next month even when nothing is assigned there.
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
        <h2>Assigned in Future Months</h2>
        <span className="tabular-nums">{format(data.assignedInFuture)}</span>
      </div>
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
