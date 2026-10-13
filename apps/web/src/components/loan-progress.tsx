import { NUMBER_FORMAT_SPECS, paidOffSavings } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { cn } from "@everycent/ui/lib/utils";
import confetti from "canvas-confetti";
import {
  ChevronDown,
  ChevronRight,
  Gamepad2,
  Image,
  LineChart,
  PartyPopper,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useBudget } from "@/lib/budget-context";
import {
  type LoanPlan,
  type MessagePart,
  type ProgressMessage,
  progressMessage,
  remainingPercent,
  trackAt,
} from "@/lib/loan-planner";
import { longMonth } from "@/lib/loans";
import { LoanChart, LoanChartLegend, type LoanSeries, SERIES_HINTS } from "./loan-chart";

/** Rounds to whole major units, half up, and drops the decimals ("$9,745"). */
export function useWholeFormat() {
  const { budget, formatAmount } = useBudget();
  const spec = NUMBER_FORMAT_SPECS[budget.numberFormat];
  return (minorUnits: bigint, exponent: number) => {
    const unit = 10n ** BigInt(exponent);
    const half = unit / 2n;
    const whole = ((minorUnits + (minorUnits < 0n ? -half : half)) / unit) * unit;
    return formatAmount({ amount: whole, currency: budget.currency }).replace(
      new RegExp(`\\${spec.decimal}\\d+$`),
      "",
    );
  };
}

/** Remembers a dismissed banner on this device. */
function useDismissed(key: string) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  return [
    dismissed,
    () => {
      setDismissed(true);
      try {
        localStorage.setItem(key, "1");
      } catch {
        // Storage can be blocked; the banner just comes back next time.
      }
    },
  ] as const;
}

function Banner({
  icon,
  title,
  text,
  action,
  onAction,
  onDismiss,
  tone,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: string;
  onAction: () => void;
  onDismiss: () => void;
  tone: "primary" | "success";
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-lg border px-4 py-3",
        tone === "primary"
          ? "border-primary/40 bg-primary/10"
          : "border-emerald-500/40 bg-emerald-500/15",
      )}
    >
      <span className="shrink-0 text-primary" aria-hidden>
        {icon}
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="font-semibold">{title}</p>
        <p className="text-sm">{text}</p>
      </div>
      <Button size="sm" onClick={onAction}>
        {action}
      </Button>
      <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={onDismiss}>
        <X />
      </Button>
    </section>
  );
}

/**
 * YNAB's loan page banners (2026-10-13): the payoff simulator ("Try It Now"), and, once the loan is
 * paid off, "Another debt bites the dust." with confetti.
 */
export function LoanBanners({
  accountId,
  paidOff,
  onSimulate,
}: {
  accountId: string;
  paidOff: boolean;
  onSimulate?: () => void;
}) {
  const [promoHidden, hidePromo] = useDismissed(`loan-simulator-banner:${accountId}`);
  const [cheerHidden, hideCheer] = useDismissed(`loan-paid-off-banner:${accountId}`);
  return (
    <>
      {!promoHidden && onSimulate && (
        <Banner
          tone="primary"
          icon={<Gamepad2 className="size-8" />}
          title="Make a plan to crush your debts with the loan payoff simulator"
          text="Find out how to save money and achieve your goals faster."
          action="Try It Now"
          onAction={onSimulate}
          onDismiss={hidePromo}
        />
      )}
      {paidOff && !cheerHidden && (
        <Banner
          tone="success"
          icon={<PartyPopper className="size-8" />}
          title="Another debt bites the dust."
          text="This calls for confetti. We're loading the cannon."
          action="Let's Celebrate"
          onAction={() => void confetti({ particleCount: 160, spread: 80, origin: { y: 0.4 } })}
          onDismiss={hideCheer}
        />
      )}
    </>
  );
}

/** A message with YNAB's highlighted amounts. */
export function MessageLine({ parts }: { parts: MessagePart[] }) {
  return (
    <p>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <strong key={i} className="rounded bg-primary/15 px-1 font-semibold">
            {part.strong}
          </strong>
        ),
      )}
    </p>
  );
}

export function MessageBox({
  message,
  onIncreaseTarget,
  onIncreaseMinimum,
}: {
  message: ProgressMessage;
  onIncreaseTarget?: () => void;
  onIncreaseMinimum?: () => void;
}) {
  const [first, ...rest] = message.lines;
  return (
    <div
      className={cn(
        "grid justify-items-center gap-2 rounded-md px-4 py-3 text-center text-sm",
        message.tone === "warning" && "bg-amber-500/15",
        message.tone === "success" && "bg-emerald-500/15",
        message.tone === "info" && "bg-primary/10",
      )}
    >
      {first && <MessageLine parts={first} />}
      {message.increaseTarget && onIncreaseTarget && (
        <Button size="sm" variant="secondary" onClick={onIncreaseTarget}>
          Increase your target
        </Button>
      )}
      {message.increaseMinimum && onIncreaseMinimum && (
        <Button size="sm" variant="secondary" onClick={onIncreaseMinimum}>
          Increase your minimum monthly payment
        </Button>
      )}
      {rest.map((parts, i) => (
        <MessageLine key={i} parts={parts} />
      ))}
    </div>
  );
}

/** The series a plan draws, in YNAB's legend order. */
export function planSeries(plan: LoanPlan): LoanSeries[] {
  const { tracks } = plan;
  const series: LoanSeries[] = [];
  if (tracks.past.balances.length > 1 || plan.progress.paidOff) series.push("past");
  if (tracks.original) series.push("original");
  if (tracks.minimum) series.push("minimum");
  if (tracks.current) series.push("current");
  return series;
}

/** YNAB's Current Track hint depends on whether a target drives it. */
export function seriesHints(plan: LoanPlan) {
  return {
    ...SERIES_HINTS,
    current:
      plan.target !== null
        ? "Estimated future balance if you pay your paired category’s target amount every payment period."
        : SERIES_HINTS.minimum,
  };
}

/**
 * YNAB's "Your Loan's Progress" card (2026-10-13): Balance Remaining with its share of the starting
 * balance, Share Your Progress, Open Payoff Simulator (not once paid off), the chart and the
 * message under it.
 */
export function LoanProgressCard({
  plan,
  onShare,
  onSimulate,
  onIncreaseTarget,
  onIncreaseMinimum,
  onBaseOriginal,
}: {
  plan: LoanPlan;
  /** Undefined for a closed loan (YNAB: sharing "isn't available if you've closed your loan"). */
  onShare?: () => void;
  onSimulate?: () => void;
  onIncreaseTarget?: () => void;
  onIncreaseMinimum?: () => void;
  /** YNAB's "Base the Original Payment Schedule on this Past Balance". */
  onBaseOriginal?: (month: string) => void;
}) {
  const { budget, formatAmount } = useBudget();
  const whole = useWholeFormat();
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const { progress } = plan;
  const format = (m: bigint) => formatAmount({ amount: m, currency: budget.currency });
  const savings = paidOffSavings(progress, plan.current);
  const message = progressMessage(plan, format, savings);
  const series = planSeries(plan);
  const warning = message?.tone === "warning";
  const Toggle = open ? ChevronDown : ChevronRight;
  return (
    <section className="overflow-hidden rounded-lg border" aria-label="Your Loan's Progress">
      <button
        type="button"
        className="flex w-full items-center justify-between border-b px-4 py-3 text-left font-semibold text-sm"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Your Loan's Progress
        <Toggle className="size-4" aria-hidden />
      </button>
      {open && (
        <div className="grid gap-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-muted-foreground text-sm">Balance Remaining</p>
              <p className="text-2xl tabular-nums">
                <span className="font-semibold">{whole(progress.owed, plan.exponent)}</span>{" "}
                <span className="text-lg">
                  ({remainingPercent(progress.owed > 0n ? progress.owed : 0n, progress.started)}%)
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {onShare && (
                <Button variant="ghost" size="sm" onClick={onShare}>
                  <Image /> Share Your Progress
                </Button>
              )}
              {!progress.paidOff && onSimulate && (
                <Button variant="ghost" size="sm" onClick={onSimulate}>
                  <LineChart /> Open Payoff Simulator
                </Button>
              )}
            </div>
          </div>
          <LoanChartLegend
            series={series}
            paidOff={progress.paidOff}
            warning={warning}
            hints={seriesHints(plan)}
          />
          <div className="relative">
            <LoanChart
              tracks={plan.tracks}
              exponent={plan.exponent}
              paidOff={progress.paidOff}
              warning={warning}
              onPickPast={onBaseOriginal ? setPicked : undefined}
            />
            {picked && onBaseOriginal && (
              <PastBalancePopover
                plan={plan}
                month={picked}
                format={format}
                onClose={() => setPicked(null)}
                onBase={() => {
                  onBaseOriginal(picked);
                  setPicked(null);
                }}
              />
            )}
          </div>
          {message && (
            <MessageBox
              message={message}
              onIncreaseTarget={onIncreaseTarget}
              onIncreaseMinimum={onIncreaseMinimum}
            />
          )}
        </div>
      )}
    </section>
  );
}

/**
 * What YNAB shows on clicking a Past Balance point (2026-10-14): the month, the original
 * schedule's and the past balance there, and "Base the Original Payment Schedule on this Past
 * Balance".
 */
function PastBalancePopover({
  plan,
  month,
  format,
  onClose,
  onBase,
}: {
  plan: LoanPlan;
  month: string;
  format: (minorUnits: bigint) => string;
  onClose: () => void;
  onBase: () => void;
}) {
  const past = trackAt(plan.tracks.past, month);
  const original = trackAt(plan.tracks.original, month);
  return (
    <div
      role="dialog"
      aria-label={longMonth(month)}
      className="absolute top-2 left-16 z-10 grid w-80 gap-2 rounded-md border bg-popover p-3 text-popover-foreground text-sm shadow-md"
    >
      <div className="flex items-center justify-between border-b pb-2">
        <span className="font-semibold">{longMonth(month)}</span>
        <Button variant="ghost" size="icon-xs" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      {original !== undefined && (
        <p className="flex justify-between gap-4">
          <span>Original Payment Schedule</span>
          <span className="tabular-nums">{format(original)}</span>
        </p>
      )}
      {past !== undefined && (
        <p className="flex justify-between gap-4">
          <span>Past Balance</span>
          <span className="tabular-nums">{format(past)}</span>
        </p>
      )}
      <button type="button" className="text-left text-primary hover:underline" onClick={onBase}>
        Base the Original Payment Schedule on this Past Balance
      </button>
    </div>
  );
}
