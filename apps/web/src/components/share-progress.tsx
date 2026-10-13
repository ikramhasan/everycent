import { Button } from "@everycent/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@everycent/ui/components/dialog";
import { Label } from "@everycent/ui/components/label";
import { Switch } from "@everycent/ui/components/switch";
import { cn } from "@everycent/ui/lib/utils";
import { domToPng } from "modern-screenshot";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { type LoanPlan, paidOffPercent } from "@/lib/loan-planner";
import { LoanChart, LoanChartLegend } from "./loan-chart";
import { planSeries, useWholeFormat } from "./loan-progress";

/** YNAB's share formats (2026-10-13), with their aspect ratios. */
const FORMATS = [
  { id: "portrait", label: "Portrait (4:5)", aspect: "aspect-[4/5]", width: 1080 },
  { id: "story", label: "Vertical Story (9:16)", aspect: "aspect-[9/16]", width: 1080 },
  { id: "landscape", label: "Landscape (16:9)", aspect: "aspect-video", width: 1920 },
  { id: "square", label: "Square (1:1)", aspect: "aspect-square", width: 1080 },
] as const;
type Format = (typeof FORMATS)[number]["id"];

const TAGLINE = "Never worrying about this debt again.";

/**
 * YNAB's "Download and Share" (Share Your Progress, 2026-10-13): pick a format, show or hide the
 * tagline and the amounts, and download the picture. YNAB's card carries its logo; ours carries
 * the app's name.
 */
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
  const [format, setFormat] = useState<Format>("portrait");
  const [tagline, setTagline] = useState(true);
  const [amounts, setAmounts] = useState(true);
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const chosen = FORMATS.find((f) => f.id === format) ?? FORMATS[0];
  const { progress } = plan;
  const paid = paidOffPercent(progress.owed > 0n ? progress.owed : 0n, progress.started);
  const series = planSeries(plan);

  async function download() {
    if (!card.current) return;
    setBusy(true);
    try {
      const scale = chosen.width / card.current.offsetWidth;
      const url = await domToPng(card.current, { scale });
      const link = document.createElement("a");
      link.href = url;
      link.download = `${loanName} progress.png`;
      link.click();
    } catch {
      toast.error("Couldn't make the picture.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Download and Share</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="grid content-start gap-3">
            <p className="font-semibold text-sm">Format</p>
            <div className="grid gap-2" role="radiogroup" aria-label="Format">
              {FORMATS.map((f) => (
                // biome-ignore lint/a11y/useSemanticElements: a button group styled like YNAB's
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={format === f.id}
                  onClick={() => setFormat(f.id)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-sm",
                    format === f.id ? "border-primary bg-primary/10" : "bg-muted/50 hover:bg-muted",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 border-t pt-3">
              <div className="flex items-center gap-2">
                <Switch id="share-tagline" checked={tagline} onCheckedChange={setTagline} />
                <Label htmlFor="share-tagline">Show Tagline</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="share-amounts" checked={amounts} onCheckedChange={setAmounts} />
                <Label htmlFor="share-amounts">Show Amounts</Label>
              </div>
            </div>
          </div>
          <div className="grid content-start gap-2">
            <p className="font-semibold text-sm">Preview</p>
            <div className="flex justify-center rounded-lg bg-muted/60 p-4">
              <div
                ref={card}
                className={cn(
                  "relative flex w-full flex-col justify-center gap-4 overflow-hidden bg-primary p-6 text-primary-foreground",
                  chosen.aspect,
                  format === "landscape"
                    ? "max-w-xl"
                    : format === "story"
                      ? "max-w-60"
                      : "max-w-sm",
                )}
              >
                {tagline && <p className="text-center font-semibold text-lg">{TAGLINE}</p>}
                <div className="grid gap-2 rounded-lg bg-background p-4 text-foreground">
                  <p className="text-muted-foreground text-xs">{loanName}</p>
                  {amounts ? (
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
                    showAmounts={amounts}
                    paidOff={progress.paidOff}
                    className="h-36"
                  />
                  <LoanChartLegend series={series} paidOff={progress.paidOff} hints={{}} />
                </div>
                <p className="text-center font-bold text-lg tracking-tight">everycent</p>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={download} disabled={busy}>
            Download Image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
