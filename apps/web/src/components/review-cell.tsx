import { Button } from "@everycent/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { Info } from "lucide-react";

/**
 * YNAB's info column (2026-10-16): a blue icon on an unapproved transaction (also when it needs a
 * category) that offers Approve Transaction and Reject Transaction, and a yellow one on an
 * approved transaction that needs a category, which opens its category.
 */
export function ReviewCell({
  approved,
  needsCategory,
  pending,
  onApprove,
  onReject,
  onCategorize,
}: {
  approved: boolean;
  needsCategory: boolean;
  pending?: boolean;
  onApprove: () => void;
  onReject: () => void;
  onCategorize?: () => void;
}) {
  if (!approved) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="This transaction needs approval"
            title="This transaction needs approval"
          >
            <Info className="fill-blue-500 text-white dark:fill-blue-400 dark:text-background" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="grid w-56 gap-2 p-3">
          <Button type="button" size="sm" disabled={pending} onClick={onApprove}>
            Approve Transaction
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={onReject}
          >
            Reject Transaction
          </Button>
        </PopoverContent>
      </Popover>
    );
  }
  if (needsCategory) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="This transaction needs a category"
        title="This transaction needs a category"
        disabled={!onCategorize}
        onClick={onCategorize}
      >
        <Info className="fill-yellow-500 text-white dark:fill-yellow-400 dark:text-background" />
      </Button>
    );
  }
  return null;
}

/** YNAB's yellow "This needs a category" pill in the category cell. */
export function NeedsCategoryPill() {
  return (
    <span className="rounded-full bg-yellow-200 px-2 py-0.5 font-medium text-xs text-yellow-950 dark:bg-yellow-400/20 dark:text-yellow-200">
      This needs a category
    </span>
  );
}
