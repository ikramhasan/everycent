import { Button } from "@everycent/ui/components/button";
import { Skeleton } from "@everycent/ui/components/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@everycent/ui/components/toggle-group";
import { cn } from "@everycent/ui/lib/utils";
import { ChartColumn, ImageDown, Table2 } from "lucide-react";
import { domToBlob } from "modern-screenshot";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { saveBlob } from "@/lib/reports";

export type ChartView = "chart" | "table";

/**
 * A report's chart with its table view (every chart has one: it's the accessible alternative),
 * loading and empty states, and Save as PNG (an everycent extra). The table is what `view`
 * "table" shows; the PNG is of the chart.
 */
export function ChartCard({
  title,
  view,
  onViewChange,
  loading,
  empty,
  chart,
  table,
  fileName,
  className,
}: {
  title: string;
  view: ChartView;
  onViewChange: (view: ChartView) => void;
  loading?: boolean;
  /** Shown instead of the chart and table when there's nothing to show. */
  empty?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  /** The PNG's name, without ".png". */
  fileName: string;
  className?: string;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const savePng = async () => {
    if (!chartRef.current) return;
    setSaving(true);
    try {
      const background = getComputedStyle(document.body).backgroundColor;
      const blob = await domToBlob(chartRef.current, { scale: 2, backgroundColor: background });
      saveBlob(blob, `${fileName}.png`);
    } catch {
      toast.error("Couldn't save the chart.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section aria-label={title} className={cn("grid gap-3 rounded-lg border p-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{title}</h2>
        <div className="ml-auto flex items-center gap-1">
          {view === "chart" && !loading && !empty && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Save chart as PNG"
              title="Save chart as PNG"
              disabled={saving}
              onClick={savePng}
            >
              <ImageDown />
            </Button>
          )}
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={view}
            onValueChange={(v) => v && onViewChange(v as ChartView)}
            aria-label="Show as"
          >
            <ToggleGroupItem value="chart" aria-label="Chart">
              <ChartColumn />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Table">
              <Table2 />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : empty ? (
        <div className="grid h-40 place-items-center text-center text-muted-foreground text-sm">
          {empty}
        </div>
      ) : view === "chart" ? (
        <div ref={chartRef} className="min-w-0 bg-background">
          {chart}
        </div>
      ) : (
        <div className="overflow-x-auto">{table}</div>
      )}
    </section>
  );
}
