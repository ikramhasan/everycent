import { cn } from "@everycent/ui/lib/utils";
import type { BudgetMonthData } from "@/lib/months";

type Bar = NonNullable<BudgetMonthData["categories"][number]["bar"]>;

/** Share of `whole` as a CSS percentage. */
const percent = (part: string, whole: bigint) =>
  whole === 0n ? "0%" : `${Number((BigInt(part) * 100_000n) / whole) / 1000}%`;

/**
 * YNAB's progress bar under a category name: sections in proportion to what they stand for, each
 * filled with what was spent (light), what's still available (dark) and overspending (red), green
 * when the target's met, snoozed or there's no target, yellow while it asks for more, grey where
 * nothing is (support.ynab.com "Progress Bars"; the server works the sections out).
 */
export function ProgressBar({ bar, className }: { bar: Bar; className?: string }) {
  const total = bar.sections.reduce((sum, s) => sum + BigInt(s.size), 0n);
  const yellow = bar.tone === "underfunded";
  return (
    <div className={cn("flex h-1.5 gap-0.5", className)} aria-hidden>
      {(total === 0n ? [{ kind: "target", size: "1", segments: [] }] : bar.sections).map(
        (section, i) => (
          <div
            key={i}
            className="flex overflow-hidden rounded-full bg-muted"
            style={{ flexBasis: total === 0n ? "100%" : percent(section.size, total), flexGrow: 0 }}
          >
            {section.segments.map((g, j) => (
              <div
                key={j}
                className={cn(
                  "h-full",
                  g.kind === "overspent" &&
                    "bg-[repeating-linear-gradient(135deg,var(--color-red-500)_0_3px,var(--color-red-300)_3px_6px)]",
                  g.kind === "spent" && (yellow ? "bg-yellow-300/80" : "bg-green-300/80"),
                  g.kind === "available" && (yellow ? "bg-yellow-500" : "bg-green-600"),
                )}
                style={{ width: percent(g.amount, BigInt(section.size)) }}
              />
            ))}
          </div>
        ),
      )}
    </div>
  );
}
