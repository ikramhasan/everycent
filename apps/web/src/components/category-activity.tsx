import { Button } from "@everycent/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { Skeleton } from "@everycent/ui/components/skeleton";
import { cn } from "@everycent/ui/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { $api } from "@/lib/api";
import { todayIso } from "@/lib/dates";

/** Which Activity to list: a category's, a group's or Uncategorized's. */
export type ActivityTarget = { categoryId: string } | { groupId: string } | { uncategorized: true };

/**
 * An Activity amount that opens YNAB's Activity popover: the month's transactions behind it.
 * Clicking one opens its account's register on that transaction.
 */
export function ActivityButton({
  budgetId,
  month,
  target,
  name,
  amount,
  format,
  formatDate,
  className,
}: {
  budgetId: string;
  month: string;
  target: ActivityTarget;
  name: string;
  amount: string;
  format: (minorUnits: string) => string;
  formatDate: (isoDate: string) => string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // YNAB disables the button when there's no activity.
  if (amount === "0") return <span className={className}>{format(amount)}</span>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Activity of ${name}: ${format(amount)}`}
          className={cn(
            "max-w-full truncate rounded-md px-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          {format(amount)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[34rem] max-w-[calc(100vw-2rem)] p-0">
        {open && (
          <ActivityList
            budgetId={budgetId}
            month={month}
            target={target}
            name={name}
            format={format}
            formatDate={formatDate}
            onClose={() => setOpen(false)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function ActivityList({
  budgetId,
  month,
  target,
  name,
  format,
  formatDate,
  onClose,
}: {
  budgetId: string;
  month: string;
  target: ActivityTarget;
  name: string;
  format: (minorUnits: string) => string;
  formatDate: (isoDate: string) => string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const query = {
    today: todayIso(),
    ...("categoryId" in target ? { categoryId: target.categoryId } : {}),
    ...("groupId" in target ? { groupId: target.groupId } : {}),
    ...("uncategorized" in target ? { uncategorized: "true" as const } : {}),
  };
  const openTransaction = (t: { accountId: string; transactionId: string }) => {
    onClose();
    void navigate({
      to: "/budgets/$budgetId/accounts/$accountId",
      params: { budgetId, accountId: t.accountId },
      search: { transaction: t.transactionId },
    });
  };
  const activity = $api.useQuery("get", "/v1/budgets/{budgetId}/months/{month}/activity", {
    params: { path: { budgetId, month }, query },
  });

  return (
    <div className="grid">
      <div className="border-b px-4 py-3">
        <p className="font-semibold text-sm">Activity</p>
        <p className="text-muted-foreground text-sm">{name}</p>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {activity.isPending ? (
          <Skeleton className="m-4 h-16" />
        ) : activity.isError ? (
          <p className="p-4 text-muted-foreground text-sm">Couldn't load the transactions.</p>
        ) : (
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
              {activity.data.transactions.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer border-t hover:bg-muted/60"
                  onClick={() => openTransaction(t)}
                >
                  <td className="max-w-28 truncate px-4 py-1.5">
                    {/* The row is clickable; this button is the keyboard way in. */}
                    <button
                      type="button"
                      className="max-w-full truncate focus-visible:underline focus-visible:outline-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTransaction(t);
                      }}
                    >
                      {t.accountName}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">{formatDate(t.date)}</td>
                  <td className="max-w-32 truncate px-2 py-1.5">{t.payeeName}</td>
                  <td className="max-w-32 truncate px-2 py-1.5 text-muted-foreground">{t.memo}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">
                    {format(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex justify-end border-t px-4 py-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
