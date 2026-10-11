import type { components } from "@everycent/api-client";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@everycent/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@everycent/ui/components/dropdown-menu";
import { Input } from "@everycent/ui/components/input";
import { Label } from "@everycent/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { cn } from "@everycent/ui/lib/utils";
import {
  ArrowRightLeft,
  Bookmark,
  CalendarClock,
  Circle,
  CircleCheck,
  Copy,
  MoreHorizontal,
  NotebookPen,
  Repeat,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { FLAG_CLASS, type Flag, type FlagColor, flagLabel } from "@/lib/flags";
import { type CategoryOption, categoryLabel } from "@/lib/transactions";
import { CategoryField } from "./register-fields";

export type BulkAction =
  | { type: "cleared"; cleared: "cleared" | "uncleared" }
  | { type: "flag"; flag: FlagColor | null }
  | { type: "categorize"; categoryId: string }
  | { type: "memo"; memo: string }
  | { type: "move"; accountId: string }
  | { type: "delete" }
  | { type: "duplicate" }
  /** Scheduled rows only. */
  | { type: "enterNow" };

type Summary = components["schemas"]["SelectionSummary"];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Shown while transactions are selected, like YNAB's action bar: how many and their total, then
 * Categorize, Flag, Clear and More, each offered only when it applies to the selection.
 * Scheduled rows count too: Enter Now shows when only scheduled rows are selected, and Make
 * Repeating when one plain transaction is (both as YNAB offers them).
 */
export function SelectionBar({
  summary,
  total,
  allMatching,
  canSelectAll,
  onSelectAll,
  onClear,
  flags,
  categories,
  moveTargets,
  pending,
  onAction,
  scheduledCount = 0,
  onMakeRepeating,
}: {
  /** The selected transactions' summary; undefined while it loads. */
  summary: Summary | undefined;
  total: string | null;
  allMatching: boolean;
  /** Offer "Select all matching" (there are rows beyond the ticked ones). */
  canSelectAll: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  flags: readonly Flag[];
  categories: readonly CategoryOption[];
  /** Accounts the selection can move to: the budget's other open accounts. */
  moveTargets: readonly { id: string; name: string }[];
  pending: boolean;
  onAction: (action: BulkAction) => void;
  /** Selected scheduled rows. */
  scheduledCount?: number;
  /** Set when exactly one plain transaction is selected. */
  onMakeRepeating?: () => void;
}) {
  const [flagOpen, setFlagOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [unsplitFor, setUnsplitFor] = useState<string | null>(null);
  const [memoOpen, setMemoOpen] = useState(false);
  // Set while More opens the memo dialog, so the closing menu leaves the focus to the dialog.
  const openingDialog = useRef(false);

  const count = summary ? summary.count + scheduledCount : null;
  const s = summary;
  const onlyScheduled = s?.count === 0 && scheduledCount > 0;
  // YNAB's Clear shows when every selected row is uncleared (checked 2026-10-11); otherwise the
  // states that apply ("Mark as Cleared", "Mark as Uncleared") are in More. Scheduled rows have
  // no cleared state.
  const toggle =
    s && s.count > 0 && scheduledCount === 0 && s.uncleared === s.count ? "cleared" : null;
  const markCleared = !toggle && s ? s.uncleared > 0 : false;
  const markUncleared = !toggle && s ? s.cleared > 0 : false;
  // Splits without a transfer line get un-split; YNAB asks first.
  const unsplits = s ? s.splits - s.splitsWithTransfers : 0;

  function categorize(categoryId: string) {
    setCategoryOpen(false);
    if (unsplits > 0) setUnsplitFor(categoryId);
    else onAction({ type: "categorize", categoryId });
  }
  const unsplitName = categories.find((c) => c.id === unsplitFor);

  return (
    <section
      aria-label="Selected transactions"
      // Floats at the bottom like YNAB's, so the rows don't jump when it appears.
      className="fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg border bg-popover px-3 py-2 text-sm shadow-lg"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Clear selection"
        onClick={onClear}
      >
        <X />
        <span aria-live="polite" className="tabular-nums">
          {count === null ? "Counting…" : plural(count, "Transaction")}
        </span>
      </Button>
      {total !== null && <span className="text-muted-foreground tabular-nums">Total {total}</span>}
      {canSelectAll && !allMatching && (
        <Button type="button" variant="link" size="sm" onClick={onSelectAll}>
          Select all matching
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-1 border-l pl-2">
        {onlyScheduled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => onAction({ type: "enterNow" })}
          >
            <CalendarClock /> Enter Now
          </Button>
        )}
        {s && (s.categorizable > 0 || scheduledCount > 0) && (
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
                onChange={(id) => id && categorize(id)}
              />
            </PopoverContent>
          </Popover>
        )}
        <Popover open={flagOpen} onOpenChange={setFlagOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending || !s}>
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
        {toggle && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            title="Mark as cleared"
            onClick={() => onAction({ type: "cleared", cleared: toggle })}
          >
            <CircleCheck /> Clear
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending || !s}>
              <MoreHorizontal /> More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56"
            onCloseAutoFocus={(e) => {
              if (openingDialog.current) e.preventDefault();
              openingDialog.current = false;
            }}
          >
            {markCleared && (
              <DropdownMenuItem onSelect={() => onAction({ type: "cleared", cleared: "cleared" })}>
                <CircleCheck /> Mark as Cleared
              </DropdownMenuItem>
            )}
            {markUncleared && (
              <DropdownMenuItem
                onSelect={() => onAction({ type: "cleared", cleared: "uncleared" })}
              >
                <Circle /> Mark as Uncleared
              </DropdownMenuItem>
            )}
            {(markCleared || markUncleared) && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => onAction({ type: "duplicate" })}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            {onMakeRepeating && (
              <DropdownMenuItem onSelect={onMakeRepeating}>
                <Repeat /> Make Repeating
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                openingDialog.current = true;
                setMemoOpen(true);
              }}
            >
              <NotebookPen /> Memo…
            </DropdownMenuItem>
            {moveTargets.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ArrowRightLeft /> Move to Account
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {moveTargets.map((a) => (
                    <DropdownMenuItem
                      key={a.id}
                      onSelect={() => onAction({ type: "move", accountId: a.id })}
                    >
                      {a.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {s && (s.deletable > 0 || scheduledCount > 0) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onAction({ type: "delete" })}
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={unsplitFor !== null} onOpenChange={(open) => !open && setUnsplitFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {s?.splits === 1
                ? "Un-split and Categorize Split Transaction?"
                : "Un-split and Categorize Split Transactions?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="grid gap-2">
                {s?.splits === 1 ? (
                  <>
                    <p>A quick heads up: You have a split transaction selected.</p>
                    <p>
                      If you categorize the split transaction as "
                      {unsplitName ? categoryLabel(unsplitName) : ""}" we will un-split it.
                    </p>
                  </>
                ) : (
                  <>
                    <p>A quick heads up: You have {s?.splits} split transactions selected.</p>
                    <p>
                      If you categorize them as "{unsplitName ? categoryLabel(unsplitName) : ""}" we
                      will un-split the transactions, as long as they don't contain transfers. If
                      they do contain transfers, we'll leave them as split transactions and
                      categorize all the non-transfer sub-transactions as "
                      {unsplitName ? categoryLabel(unsplitName) : ""}."
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unsplitFor) onAction({ type: "categorize", categoryId: unsplitFor });
                setUnsplitFor(null);
              }}
            >
              Categorize
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemoDialog
        open={memoOpen}
        count={count ?? 0}
        onOpenChange={setMemoOpen}
        onSave={(memo) => {
          setMemoOpen(false);
          onAction({ type: "memo", memo });
        }}
      />
    </section>
  );
}

/** YNAB's "Edit Memo (N Transactions)": the memo replaces each selected transaction's. */
function MemoDialog({
  open,
  count,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onSave: (memo: string) => void;
}) {
  const [memo, setMemo] = useState("");
  const id = useId();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setMemo("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (memo) onSave(memo);
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit Memo ({plural(count, "Transaction")})</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={id}>Memo</Label>
            <Input
              id={id}
              value={memo}
              maxLength={500}
              placeholder="Enter a memo for selected transactions"
              autoFocus
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!memo}>
              Update {plural(count, "Transaction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
