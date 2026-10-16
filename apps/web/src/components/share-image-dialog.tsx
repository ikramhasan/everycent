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
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";

/** YNAB's share formats (2026-10-13, the same on Net Worth 2026-10-17), with aspect ratios. */
const FORMATS = [
  { id: "portrait", label: "Portrait (4:5)", aspect: "aspect-[4/5]", width: 1080 },
  { id: "story", label: "Vertical Story (9:16)", aspect: "aspect-[9/16]", width: 1080 },
  { id: "landscape", label: "Landscape (16:9)", aspect: "aspect-video", width: 1920 },
  { id: "square", label: "Square (1:1)", aspect: "aspect-square", width: 1080 },
] as const;
type Format = (typeof FORMATS)[number]["id"];

/**
 * YNAB's "Download and Share" (Share Your Progress on a loan, 2026-10-13, and on Net Worth,
 * 2026-10-17): pick a format, show or hide the tagline and the amounts, and download the picture.
 * `children` draws the card's content, with or without amounts. YNAB's card carries its logo;
 * ours carries the app's name.
 */
export function ShareImageDialog({
  open,
  onOpenChange,
  tagline,
  fileName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagline: string;
  /** The picture's name, without ".png". */
  fileName: string;
  children: (options: { showAmounts: boolean }) => ReactNode;
}) {
  const [format, setFormat] = useState<Format>("portrait");
  const [showTagline, setShowTagline] = useState(true);
  const [showAmounts, setShowAmounts] = useState(true);
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const chosen = FORMATS.find((f) => f.id === format) ?? FORMATS[0];

  async function download() {
    if (!card.current) return;
    setBusy(true);
    try {
      const scale = chosen.width / card.current.offsetWidth;
      const url = await domToPng(card.current, { scale });
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName}.png`;
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
                <Switch id="share-tagline" checked={showTagline} onCheckedChange={setShowTagline} />
                <Label htmlFor="share-tagline">Show Tagline</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="share-amounts" checked={showAmounts} onCheckedChange={setShowAmounts} />
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
                {showTagline && <p className="text-center font-semibold text-lg">{tagline}</p>}
                <div className="grid gap-2 rounded-lg bg-background p-4 text-foreground">
                  {children({ showAmounts })}
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
