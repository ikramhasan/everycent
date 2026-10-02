import { AUTO_ASSIGN_OPTIONS, type AutoAssignOption } from "@everycent/engine";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@everycent/ui/components/alert-dialog";
import { Button } from "@everycent/ui/components/button";
import { useState } from "react";
import type { BudgetMonthData } from "@/lib/months";

type Format = (minorUnits: string) => string;
type MonthCategory = BudgetMonthData["categories"][number];

/** YNAB's labels, singular when one category is selected. */
function label(option: AutoAssignOption, one: boolean) {
  switch (option) {
    case "assignedLastMonth":
      return "Assigned Last Month";
    case "spentLastMonth":
      return "Spent Last Month";
    case "averageAssigned":
      return "Average Assigned";
    case "averageSpent":
      return "Average Spent";
    case "resetAvailable":
      return one ? "Reset Available Amount" : "Reset Available Amounts";
    case "resetAssigned":
      return one ? "Reset Assigned Amount" : "Reset Assigned Amounts";
  }
}

export interface AutoAssignChange {
  categoryId: string;
  name: string;
  group: string;
  /** What Assigned changes by. */
  delta: bigint;
}

/** What an option would change: each category whose Assigned moves, and by how much. */
export function autoAssignChanges(
  option: AutoAssignOption,
  categories: readonly MonthCategory[],
  names: ReadonlyMap<string, { name: string; group: string }>,
): AutoAssignChange[] {
  return categories.flatMap((c) => {
    const delta = BigInt(c.autoAssign[option]) - BigInt(c.assigned);
    const named = names.get(c.categoryId);
    return delta !== 0n && named ? [{ categoryId: c.categoryId, ...named, delta }] : [];
  });
}

/**
 * The amount on an option's button: what the categories would end up with (YNAB showed $30.00 on
 * Assigned Last Month for $30.00 assigned last month, and $0.00 on both resets). For Reset
 * Available that's the Available after it, otherwise the Assigned.
 */
function buttonAmount(option: AutoAssignOption, categories: readonly MonthCategory[]) {
  return categories.reduce((sum, c) => {
    const target = BigInt(c.autoAssign[option]);
    if (option !== "resetAvailable") return sum + target;
    return sum + BigInt(c.available) + target - BigInt(c.assigned);
  }, 0n);
}

/**
 * YNAB's Auto-Assign section of the inspector. With categories selected an option applies to them
 * at once; with none selected it covers every visible category, after a preview (and Reset
 * Assigned asks first, as the help center says).
 */
export function AutoAssignPanel({
  categories,
  names,
  selection,
  format,
  onApply,
  onViewAll,
}: {
  /** The categories it covers: the selection, or the rows in view. */
  categories: readonly MonthCategory[];
  names: ReadonlyMap<string, { name: string; group: string }>;
  /** Whether categories are selected (no preview then). */
  selection: boolean;
  format: Format;
  onApply: (option: AutoAssignOption) => Promise<void>;
  /** A view that keeps nothing: YNAB says so instead of listing the options. */
  onViewAll?: () => void;
}) {
  const [preview, setPreview] = useState<AutoAssignOption | null>(null);
  // YNAB's labels go singular whenever one category is covered (selected or the only one in view).
  const one = categories.length === 1;
  const changes = preview ? autoAssignChanges(preview, categories, names) : [];
  const byGroup = new Map<string, AutoAssignChange[]>();
  for (const c of changes) byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]);

  return (
    <section aria-label="Auto-Assign" className="grid gap-2 rounded-lg border p-4">
      <h2 className="font-semibold text-sm">Auto-Assign</h2>
      {categories.length === 0 ? (
        <div className="grid justify-items-start gap-1 text-muted-foreground text-sm">
          <p>This view has no categories.</p>
          {onViewAll && (
            <Button variant="link" size="sm" className="h-auto p-0" onClick={onViewAll}>
              View All Categories
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-1">
          {AUTO_ASSIGN_OPTIONS.map((option) => {
            const amount = format(buttonAmount(option, categories).toString());
            return (
              <Button
                key={option}
                variant="secondary"
                size="sm"
                aria-label={`${label(option, one)} ${amount}`}
                className="justify-between font-normal"
                onClick={() => (selection ? void onApply(option) : setPreview(option))}
              >
                <span>{label(option, one)}</span>
                <span className="tabular-nums">{amount}</span>
              </Button>
            );
          })}
        </div>
      )}

      <AlertDialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Auto-Assign Preview: {preview && label(preview, false)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {changes.length === 0
                ? "This won't change any assigned amounts."
                : `This will update the assigned amount for ${changes.length} ${
                    changes.length === 1 ? "category" : "categories"
                  }.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {changes.length > 0 && (
            <div className="grid max-h-72 gap-3 overflow-y-auto text-sm">
              {[...byGroup].map(([group, list]) => (
                <div key={group} className="grid gap-1">
                  <p className="font-semibold">{group}</p>
                  {list.map((c) => (
                    <div key={c.categoryId} className="flex justify-between gap-2 pl-2">
                      <span className="truncate">{c.name}</span>
                      <span className="tabular-nums">
                        {c.delta > 0n ? "+" : ""}
                        {format(c.delta.toString())}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={changes.length === 0}
              onClick={() => {
                if (preview) void onApply(preview);
                setPreview(null);
              }}
            >
              Update Assigned Amounts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
