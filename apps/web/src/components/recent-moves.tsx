import { Button } from "@everycent/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { Spinner } from "@everycent/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@everycent/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { format as formatDay } from "date-fns";
import { ArrowLeftRight, History, MinusCircle, PlusCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { $api } from "@/lib/api";
import type { CategoryList } from "@/lib/categories";
import { todayIso } from "@/lib/dates";
import { monthLabel } from "@/lib/months";

export const movesQueryOptions = (budgetId: string) =>
  $api.queryOptions("get", "/v1/budgets/{budgetId}/moves", { params: { path: { budgetId } } });

type Filter = "all" | "moved" | "assigned";

/**
 * YNAB's "Recent Moves": every change to assigned money, newest first, by day. "Assigned" lists
 * money assigned and removed; "Moved" money moved between categories.
 */
export function RecentMoves({
  budgetId,
  categories,
  format,
  formatDate,
}: {
  budgetId: string;
  categories: CategoryList;
  format: (minorUnits: string) => string;
  formatDate: (isoDate: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const moves = useQuery({ ...movesQueryOptions(budgetId), enabled: open });
  const names = useMemo(
    () => new Map(categories.groups.flatMap((g) => g.categories.map((c) => [c.id, c.name]))),
    [categories],
  );

  const days = useMemo(() => {
    const byDay = new Map<string, NonNullable<typeof moves.data>["moves"]>();
    for (const m of moves.data?.moves ?? []) {
      if (filter === "moved" && m.kind !== "moved") continue;
      if (filter === "assigned" && m.kind === "moved") continue;
      const day = formatDay(new Date(m.movedAt), "yyyy-MM-dd");
      byDay.set(day, [...(byDay.get(day) ?? []), m]);
    }
    return [...byDay];
  }, [moves.data, filter]);

  const category = (id: string | null, month: string) => (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
      {id ? (names.get(id) ?? "Deleted category") : "Ready to Assign"}
      <span className="text-[0.65rem] text-muted-foreground uppercase">{monthLabel(month)}</span>
    </span>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <History /> Recent Moves
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <h2 className="font-semibold">Recent Moves</h2>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={filter}
            onValueChange={(v) => v && setFilter(v as Filter)}
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="moved">Moved</ToggleGroupItem>
            <ToggleGroupItem value="assigned">Assigned</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="grid max-h-96 gap-3 overflow-y-auto p-3">
          {moves.isPending ? (
            <Spinner className="mx-auto" />
          ) : days.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm">No moves yet.</p>
          ) : (
            days.map(([day, list]) => (
              <section key={day} className="grid gap-2">
                <h3 className="flex justify-between text-muted-foreground text-xs">
                  <span>{formatDate(day)}</span>
                  {day === todayIso() && <span>Today</span>}
                </h3>
                {list.map((m) => (
                  <div key={m.id} className="flex gap-2 rounded-md border p-2 text-sm">
                    {m.kind === "moved" ? (
                      <ArrowLeftRight className="mt-0.5 size-4 shrink-0" />
                    ) : m.kind === "assigned" ? (
                      <PlusCircle className="mt-0.5 size-4 shrink-0" />
                    ) : (
                      <MinusCircle className="mt-0.5 size-4 shrink-0" />
                    )}
                    <div className="grid gap-1">
                      <span>
                        {m.kind === "moved"
                          ? "Moved"
                          : m.kind === "assigned"
                            ? "Assigned"
                            : "Removed"}{" "}
                        <strong className="tabular-nums">{format(m.amount)}</strong>
                      </span>
                      {m.kind !== "assigned" && (
                        <span className="text-muted-foreground">
                          from {category(m.fromCategoryId, m.month)}
                        </span>
                      )}
                      {m.kind !== "removed" && (
                        <span className="text-muted-foreground">
                          to {category(m.toCategoryId, m.month)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
