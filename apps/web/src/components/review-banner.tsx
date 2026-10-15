import { Button } from "@everycent/ui/components/button";
import { Info } from "lucide-react";

/** What the banner's View button searches for (YNAB, 2026-10-16). */
export const REVIEW_SEARCH = "Is: Unapproved or Needs Category, ";

/**
 * YNAB's banner over a register with transactions to review: "N new transactions to approve or
 * categorize." with a View button that searches for them. Hidden when there are none.
 */
export function ReviewBanner({ count, onView }: { count: number; onView: () => void }) {
  if (count <= 0) return null;
  return (
    <section
      aria-label="Transactions to review"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary/10 px-4 py-2 text-sm"
    >
      <p className="flex items-center gap-2">
        <Info className="size-4 shrink-0" aria-hidden />
        {count} new {count === 1 ? "transaction" : "transactions"} to approve or categorize.
      </p>
      <Button size="sm" onClick={onView}>
        View
      </Button>
    </section>
  );
}
