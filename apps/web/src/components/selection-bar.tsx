import { Button } from "@everycent/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { cn } from "@everycent/ui/lib/utils";
import { Bookmark, Circle, CircleCheck, Tag, X } from "lucide-react";
import { useState } from "react";
import { FLAG_CLASS, type Flag, type FlagColor, flagLabel } from "@/lib/flags";
import type { CategoryOption } from "@/lib/transactions";
import { CategoryField } from "./register-fields";

export type BulkAction =
  | { type: "cleared"; cleared: "cleared" | "uncleared" }
  | { type: "flag"; flag: FlagColor | null }
  | { type: "categorize"; categoryId: string };

/**
 * Shown while transactions are selected, like YNAB's action bar: how many and their total, and
 * the actions that apply to all of them at once.
 */
export function SelectionBar({
  count,
  total,
  allMatching,
  canSelectAll,
  onSelectAll,
  onClear,
  flags,
  categories,
  pending,
  onAction,
}: {
  /** Null while the count of a select-all is loading. */
  count: number | null;
  total: string | null;
  allMatching: boolean;
  /** Offer "Select all matching" (there are rows beyond the ticked ones). */
  canSelectAll: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  flags: readonly Flag[];
  categories: readonly CategoryOption[];
  pending: boolean;
  onAction: (action: BulkAction) => void;
}) {
  const [flagOpen, setFlagOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  return (
    <section
      aria-label="Selected transactions"
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-sm"
    >
      <p className="font-medium tabular-nums" aria-live="polite">
        {count === null ? "Counting…" : `${count} selected`}
        {total !== null && <span className="ml-2 text-muted-foreground">Total {total}</span>}
      </p>
      {canSelectAll && !allMatching && (
        <Button type="button" variant="link" size="sm" onClick={onSelectAll}>
          Select all matching
        </Button>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => onAction({ type: "cleared", cleared: "cleared" })}
        >
          <CircleCheck /> Mark cleared
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => onAction({ type: "cleared", cleared: "uncleared" })}
        >
          <Circle /> Mark uncleared
        </Button>
        <Popover open={flagOpen} onOpenChange={setFlagOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              <Bookmark /> Flag
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-1.5">
            <div role="menu" aria-label="Flag selected" className="grid">
              {flags.map((f) => (
                <button
                  key={f.color}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setFlagOpen(false);
                    onAction({ type: "flag", flag: f.color });
                  }}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <Bookmark className={cn("size-4 fill-current", FLAG_CLASS[f.color])} />
                  {flagLabel(f)}
                </button>
              ))}
              <div className="my-1 border-t" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFlagOpen(false);
                  onAction({ type: "flag", flag: null });
                }}
                className="rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                Clear flag
              </button>
            </div>
          </PopoverContent>
        </Popover>
        <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              <Tag /> Categorize
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <CategoryField
              label="Category for selected"
              value={null}
              categories={categories}
              autoFocus
              onChange={(id) => {
                if (!id) return;
                setCategoryOpen(false);
                onAction({ type: "categorize", categoryId: id });
              }}
            />
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear selection"
          onClick={onClear}
        >
          <X />
        </Button>
      </div>
    </section>
  );
}
