import type { CurrencyCode } from "@everycent/engine";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@everycent/ui/components/table";
import { cn } from "@everycent/ui/lib/utils";
import { ArrowDown, ArrowUp, Info, Star } from "lucide-react";
import { headline, monthRows, type NetWorthReport } from "@/lib/net-worth";
import { monthLabel } from "@/lib/reports";
import { useAmountFormat } from "./format";

/** A change with YNAB's arrow and percent ("↓ −$15,966.74 (−5.2%)"). */
export function Change({
  amount,
  percent,
  format,
  showAmount = true,
  className,
}: {
  amount: bigint;
  percent: string | null;
  format: ReturnType<typeof useAmountFormat>;
  showAmount?: boolean;
  className?: string;
}) {
  const Arrow = amount < 0n ? ArrowDown : ArrowUp;
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1 tabular-nums",
        amount < 0n
          ? "text-destructive"
          : amount > 0n
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-muted-foreground",
        className,
      )}
    >
      {amount !== 0n && <Arrow aria-hidden className="size-3.5" />}
      {showAmount ? format.exact(amount) : format.masked}
      {percent !== null && <span>({percent})</span>}
    </span>
  );
}

/**
 * YNAB's headline (2026-10-17): Net Worth, Assets, Debts and Change in Net Worth (the last month
 * less the first in the range), plus everycent's change this month.
 */
export function NetWorthHeadline({
  report,
  showAmounts = true,
  compact = false,
}: {
  report: Pick<NetWorthReport, "opening" | "months" | "currency">;
  showAmounts?: boolean;
  compact?: boolean;
}) {
  const format = useAmountFormat(report.currency as CurrencyCode);
  const h = headline(report);
  if (!h) return null;
  const amount = (v: bigint) => (showAmounts ? format.exact(v) : format.masked);
  return (
    <div className="grid gap-3">
      <div>
        <p className="text-muted-foreground text-xs">Net Worth</p>
        <p
          className={cn(
            "font-semibold tabular-nums tracking-tight",
            compact ? "text-xl" : "text-3xl",
          )}
        >
          {amount(h.netWorth)}
        </p>
      </div>
      <dl className={cn("grid gap-x-6 gap-y-2", compact ? "grid-cols-3" : "grid-cols-2 sm:flex")}>
        <div>
          <dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <span aria-hidden className="size-2 rounded-xs bg-(--report-1)" />
            Assets
          </dt>
          <dd className="tabular-nums">{amount(h.assets)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <span aria-hidden className="size-2 rounded-xs bg-(--report-4)" />
            Debts
          </dt>
          <dd className="tabular-nums">{amount(h.debts)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Change in Net Worth</dt>
          <dd>
            <Change
              amount={h.rangeChange}
              percent={h.rangePercent}
              format={format}
              showAmount={showAmounts}
            />
          </dd>
        </div>
        {!compact && (
          <div>
            <dt className="text-muted-foreground text-xs">This month</dt>
            <dd>
              <Change amount={h.monthChange} percent={h.monthPercent} format={format} />
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/** YNAB's table: Month, Net Worth, Monthly Change, newest first (everycent adds the high mark). */
export function NetWorthMonthTable({
  report,
}: {
  report: Pick<NetWorthReport, "opening" | "months" | "currency">;
}) {
  const format = useAmountFormat(report.currency as CurrencyCode);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead className="text-right">Net Worth</TableHead>
          <TableHead className="text-right">
            <span
              className="inline-flex items-center gap-1"
              title="This column highlights how much your net worth has changed month over month."
            >
              Monthly Change
              <Info aria-hidden className="size-3.5" />
            </span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {monthRows(report).map((r) => (
          <TableRow key={r.month}>
            <TableCell>
              <span className="inline-flex items-center gap-1.5">
                {monthLabel(r.month, "long")}
                {r.allTimeHigh && (
                  <Star
                    className="size-3.5 fill-(--report-7) text-foreground"
                    aria-label="New all-time high"
                  />
                )}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">{format.exact(r.netWorth)}</TableCell>
            <TableCell className="text-right">
              <Change amount={r.change} percent={r.changePercent} format={format} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
