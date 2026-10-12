import { cn } from "@everycent/ui/lib/utils";
import type { BudgetMonthData } from "@/lib/months";

type Bar = NonNullable<BudgetMonthData["categories"][number]["bar"]>;

/** Share of `whole` as a CSS percentage. */
const percent = (part: string, whole: bigint) =>
  whole === 0n ? "0%" : `${Number((BigInt(part) * 100_000n) / whole) / 1000}%`;

/** YNAB's stripes for spent money and overspending: 5px of one shade, 1px of the other, at 135°. */
const stripes = (shade: string, stripe: string) =>
  `repeating-linear-gradient(135deg, var(${shade}) 0 5px, var(${stripe}) 5px 6px)`;

/**
 * YNAB's progress bar under a category name: sections in proportion to what they stand for, each
 * filled with what was spent (striped), what's still available (solid) and overspending (red
 * stripes), green when the target's met, snoozed or there's no target, yellow while it asks for
 * more, the track's colour where nothing is (support.ynab.com "Progress Bars"; the server works the
 * sections out). Sizes, corners and colours are YNAB's (app.ynab.com, 2026-10-12): 4px tall, 4px
 * between sections, rounded at the ends; the colours are the `--bar-*` variables in styles.css.
 */
export function ProgressBar({ bar, className }: { bar: Bar; className?: string }) {
  const total = bar.sections.reduce((sum, s) => sum + BigInt(s.size), 0n);
  const yellow = bar.tone === "underfunded";
  const sections =
    total === 0n ? [{ kind: "target" as const, size: "1", segments: [] }] : bar.sections;
  // The extra section stands apart; the others round only at their ends (YNAB O6: five weeks, the
  // first rounded left, the fifth right, then the extra one fully rounded).
  const last = sections.findLastIndex((s) => s.kind !== "extra");
  return (
    <div className={cn("flex h-1 gap-1", className)} aria-hidden>
      {sections.map((section, i) => (
        <div
          key={i}
          className={cn(
            "flex overflow-hidden bg-(--bar-track) shadow-[inset_0_0_0_1px_var(--bar-border)]",
            section.kind === "extra" || last === 0
              ? "rounded-full"
              : i === 0
                ? "rounded-l-full"
                : i === last && "rounded-r-full",
          )}
          style={{ flexBasis: total === 0n ? "100%" : percent(section.size, total), flexGrow: 0 }}
        >
          {section.segments.map((g, j) => (
            <div
              key={j}
              className={cn(
                "h-full",
                g.kind === "available" && (yellow ? "bg-(--bar-underfunded)" : "bg-(--bar-funded)"),
              )}
              style={{
                width: percent(g.amount, BigInt(section.size)),
                backgroundImage:
                  g.kind === "overspent"
                    ? stripes("--bar-overspent", "--bar-overspent-stripe")
                    : g.kind === "spent"
                      ? yellow
                        ? stripes("--bar-underfunded-spent", "--bar-underfunded-spent-stripe")
                        : stripes("--bar-funded-spent", "--bar-funded-spent-stripe")
                      : undefined,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
