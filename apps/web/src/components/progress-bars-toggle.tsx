import { ToggleGroup, ToggleGroupItem } from "@everycent/ui/components/toggle-group";
import { Rows2, Rows3 } from "lucide-react";

/**
 * YNAB's two icons at the right of the plan toolbar: two lines shows progress bars, three lines
 * hides them (and the notes under category names) for a compact list.
 */
export function ProgressBarsToggle({
  on,
  onChange,
  className,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label="Progress bars"
      className={className}
      value={on ? "on" : "off"}
      onValueChange={(value) => value && onChange(value === "on")}
    >
      <ToggleGroupItem value="on" aria-label="Show progress bars" title="Show progress bars">
        <Rows2 />
      </ToggleGroupItem>
      <ToggleGroupItem value="off" aria-label="Hide progress bars" title="Hide progress bars">
        <Rows3 />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
