import { ToggleGroup, ToggleGroupItem } from "@everycent/ui/components/toggle-group";
import { BUDGET_FILTERS, type BudgetFilter } from "@/lib/budget-view";

/**
 * YNAB's views above the budget list: All, Overspent (with its count) and Money Available.
 * Underfunded, Overfunded and Snoozed need targets (phase 8).
 */
export function BudgetFilterBar({
  filter,
  overspent,
  onChange,
}: {
  filter: BudgetFilter;
  /** How many categories are overspent this month. */
  overspent: number;
  onChange: (filter: BudgetFilter) => void;
}) {
  const labels: Record<BudgetFilter, string> = {
    all: "All",
    overspent: `${overspent} Overspent`,
    available: "Money Available",
  };
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label="Budget view"
      value={filter}
      onValueChange={(value) => {
        const next = BUDGET_FILTERS.find((f) => f === value);
        if (next) onChange(next);
      }}
      className="justify-start"
    >
      {/* YNAB leaves Overspent out when nothing is, unless that view is on ("0 Overspent"). */}
      {BUDGET_FILTERS.filter((f) => f !== "overspent" || overspent > 0 || filter === f).map((f) => (
        <ToggleGroupItem
          key={f}
          value={f}
          className={
            f === "overspent" && overspent > 0
              ? "text-destructive data-[state=on]:text-destructive"
              : undefined
          }
        >
          {labels[f]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
