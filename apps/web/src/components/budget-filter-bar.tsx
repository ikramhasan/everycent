import { ToggleGroup, ToggleGroupItem } from "@everycent/ui/components/toggle-group";
import type { ReactNode } from "react";
import { type BudgetFilter, isPresetFilter } from "@/lib/budget-view";

/** The views Manage Views can't move: always first, in this order. */
const FIXED: readonly BudgetFilter[] = ["all", "overspent"];

/**
 * YNAB's views above the budget list: All, Overspent (with its count), then Underfunded,
 * Overfunded, Money Available, Snoozed and the custom views in the plan's order, and the Views
 * Menu after them.
 */
export function BudgetFilterBar({
  filter,
  overspent,
  onChange,
  order = ["underfunded", "overfunded", "available", "snoozed"],
  custom = [],
  menu,
}: {
  /** A preset view or a custom view's id. */
  filter: string;
  /** How many categories are overspent this month. */
  overspent: number;
  onChange: (filter: string) => void;
  /** The rearrangeable views in order: preset keys and custom view ids. */
  order?: readonly string[];
  custom?: readonly { id: string; name: string }[];
  /** The Views Menu (Manage Views, New View). */
  menu?: ReactNode;
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
  const keys = [...FIXED, ...order].filter((key) => isPresetFilter(key) || names.has(key));
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
        {/* YNAB leaves Overspent out when nothing is, unless that view is on ("0 Overspent"). */}
        {keys
          .filter((f) => f !== "overspent" || overspent > 0 || filter === f)
          .map((f) => (
            <ToggleGroupItem
              key={f}
              value={f}
              className={
                f === "overspent" && overspent > 0
                  ? "text-destructive data-[state=on]:text-destructive"
                  : undefined
              }
            >
              {isPresetFilter(f) ? labels[f] : names.get(f)}
            </ToggleGroupItem>
          ))}
      </ToggleGroup>
      {menu}
    </div>
  );
}
