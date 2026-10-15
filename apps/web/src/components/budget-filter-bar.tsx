import { ToggleGroup, ToggleGroupItem } from "@everycent/ui/components/toggle-group";
import type { ReactNode } from "react";
import { type BudgetFilter, fitsViewsBar, isPresetFilter } from "@/lib/budget-view";

/** A view that didn't fit the bar, for the Views Menu. */
export interface OverflowView {
  key: string;
  label: string;
}

/** The views Manage Views can't move: always first, in this order. */
const FIXED: readonly BudgetFilter[] = ["all", "overspent"];

/**
 * YNAB's views above the budget list: All, Overspent (with its count), then Underfunded,
 * Overfunded, Money Available, Snoozed and the custom views in the plan's order, and the Views
 * Menu after them. Views that don't fit the window (`fitsViewsBar`) move into the Views Menu,
 * except the selected one.
 */
export function BudgetFilterBar({
  filter,
  overspent,
  onlyCredit = false,
  onChange,
  order = ["underfunded", "overfunded", "available", "snoozed"],
  custom = [],
  viewportWidth = Number.POSITIVE_INFINITY,
  menu,
}: {
  /** A preset view or a custom view's id. */
  filter: string;
  /** How many categories are overspent this month. */
  overspent: number;
  /** All of it is credit overspending: YNAB draws the view yellow instead of red. */
  onlyCredit?: boolean;
  onChange: (filter: string) => void;
  /** The rearrangeable views in order: preset keys and custom view ids. */
  order?: readonly string[];
  custom?: readonly { id: string; name: string }[];
  /** The window's width in CSS pixels, which decides how many views fit the bar. */
  viewportWidth?: number;
  /** The Views Menu (the views that didn't fit, Manage Views, New View). */
  menu?: (overflow: readonly OverflowView[]) => ReactNode;
}) {
  const labels: Record<BudgetFilter, string> = {
    all: "All",
    overspent: `${overspent} Overspent`,
    underfunded: "Underfunded",
    overfunded: "Overfunded",
    available: "Money Available",
    snoozed: "Snoozed",
  };
  const names = new Map(custom.map((v) => [v.id, v.name]));
  // YNAB leaves Overspent out when nothing is, unless that view is on ("0 Overspent").
  const keys = [...FIXED, ...order].filter(
    (key) =>
      (isPresetFilter(key) || names.has(key)) &&
      (key !== "overspent" || overspent > 0 || filter === key),
  );
  const label = (key: string) => (isPresetFilter(key) ? labels[key] : (names.get(key) ?? key));
  const onBar = keys.filter((key, i) => key === filter || fitsViewsBar(i, viewportWidth));
  const overflow = keys
    .filter((key) => !onBar.includes(key))
    .map((key) => ({ key, label: label(key) }));
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label="Budget view"
        value={filter}
        onValueChange={(value) => {
          if (keys.includes(value)) onChange(value);
        }}
        className="flex-wrap justify-start"
      >
        {onBar.map((f) => (
          <ToggleGroupItem
            key={f}
            value={f}
            className={
              f === "overspent" && overspent > 0
                ? onlyCredit
                  ? "text-yellow-700 data-[state=on]:text-yellow-700 dark:text-yellow-400 dark:data-[state=on]:text-yellow-400"
                  : "text-destructive data-[state=on]:text-destructive"
                : undefined
            }
          >
            {label(f)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {menu?.(overflow)}
    </div>
  );
}
