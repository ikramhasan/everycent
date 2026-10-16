import { type LoanPlan, paidOffPercent } from "@/lib/loan-planner";
import { LoanChart, LoanChartLegend } from "./loan-chart";
import { planSeries, useWholeFormat } from "./loan-progress";
import { ShareImageDialog } from "./share-image-dialog";

const TAGLINE = "Never worrying about this debt again.";

/** A loan's Share Your Progress (YNAB, 2026-10-13): its balance, % paid off and chart. */
export function ShareProgressDialog({
  open,
  onOpenChange,
  plan,
  loanName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: LoanPlan;
  loanName: string;
}) {
  const whole = useWholeFormat();
  const { progress } = plan;
  const paid = paidOffPercent(progress.owed > 0n ? progress.owed : 0n, progress.started);
  const series = planSeries(plan);

  return (
    <ShareImageDialog
      open={open}
      onOpenChange={onOpenChange}
      tagline={TAGLINE}
      fileName={`${loanName} progress`}
    >
      {({ showAmounts }) => (
        <>
          <p className="text-muted-foreground text-xs">{loanName}</p>
          {showAmounts ? (
            <p className="flex items-baseline gap-2">
              <span className="font-semibold text-xl tabular-nums">
                {whole(progress.owed > 0n ? progress.owed : 0n, plan.exponent)}
              </span>
              <span className="text-xs">Remaining</span>
              <span className="text-emerald-600 text-xs dark:text-emerald-400">
                {paid}% Paid Off
              </span>
            </p>
          ) : (
            <p className="font-semibold text-xl">{paid}% Paid Off</p>
          )}
          <LoanChart
            tracks={plan.tracks}
            exponent={plan.exponent}
            showAmounts={showAmounts}
            paidOff={progress.paidOff}
            className="h-36"
          />
          <LoanChartLegend series={series} paidOff={progress.paidOff} hints={{}} />
        </>
      )}
    </ShareImageDialog>
  );
}
