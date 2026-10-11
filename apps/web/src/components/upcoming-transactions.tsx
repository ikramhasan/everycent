import { Button } from "@everycent/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { cn } from "@everycent/ui/lib/utils";
import { useState } from "react";
import type { BudgetMonthData } from "@/lib/months";

type Upcoming = NonNullable<BudgetMonthData["categories"][number]["upcoming"]>;

/**
 * YNAB's upcoming scheduled transactions under a category's Available (checked 2026-10-12): "N
 * Upcoming Transaction(s)" with their net amount, then "Available After Upcoming", yellow when
 * that's negative. The first line opens an Activity popover listing them; a row opens its
 * account's register on the schedule.
 */
export function UpcomingTransactions({
  name,
  available,
  upcoming,
  format,
  formatDate,
  onOpen,
}: {
  name: string;
  available: bigint;
  upcoming: Upcoming;
  format: (minorUnits: string) => string;
  formatDate: (isoDate: string) => string;
  /** Opens the schedule in its account's register. */
  onOpen: (accountId: string, scheduleId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = upcoming.transactions.length;
  const after = available + BigInt(upcoming.amount);
  const label = `${count} Upcoming Transaction${count === 1 ? "" : "s"}`;
  return (
    <dl
      className={cn(
        "grid gap-1 rounded-md p-2 text-sm",
        after < 0n && "bg-yellow-100 text-yellow-950 dark:bg-yellow-900/40 dark:text-yellow-50",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <dt>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {label}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[34rem] max-w-[calc(100vw-2rem)] p-0">
              <div className="border-b px-4 py-3">
                <p className="font-semibold text-sm">Activity</p>
                <p className="text-muted-foreground text-sm">{name}</p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Account</th>
                      <th className="px-2 py-2 text-left font-medium">Date</th>
                      <th className="px-2 py-2 text-left font-medium">Payee</th>
                      <th className="px-2 py-2 text-left font-medium">Memo</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.transactions.map((t) => {
                      const openSchedule = () => {
                        setOpen(false);
                        onOpen(t.accountId, t.scheduleId);
                      };
                      return (
                        <tr
                          key={`${t.scheduleId}:${t.date}`}
                          className="cursor-pointer border-t hover:bg-muted/60"
                          onClick={openSchedule}
                        >
                          <td className="max-w-28 truncate px-4 py-1.5">
                            <button
                              type="button"
                              className="max-w-full truncate focus-visible:underline focus-visible:outline-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                openSchedule();
                              }}
                            >
                              {t.accountName}
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5">{formatDate(t.date)}</td>
                          <td className="max-w-32 truncate px-2 py-1.5">{t.payeeName}</td>
                          <td className="max-w-32 truncate px-2 py-1.5 text-muted-foreground">
                            {t.memo}
                          </td>
                          <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">
                            {format(t.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end border-t px-4 py-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </dt>
        <dd className="tabular-nums">{format(upcoming.amount)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <dt>Available After Upcoming</dt>
        <dd className="tabular-nums">{format(after.toString())}</dd>
      </div>
    </dl>
  );
}
