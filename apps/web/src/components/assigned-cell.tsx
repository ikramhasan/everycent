import { Input } from "@everycent/ui/components/input";
import { cn } from "@everycent/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export interface AssignActions {
  /** Reads typed text (math allowed, e.g. "200+50") into minor units, or explains why not. */
  parse: (text: string) => bigint | string;
  /** Minor units as an input value, without the currency symbol. */
  toInput: (amount: string) => string;
  /** Saves the new Assigned amount. */
  assign: (categoryId: string, amount: bigint) => Promise<void>;
}

/**
 * A category's Assigned amount, edited in place as in YNAB: click to type a new amount (math
 * works), Enter or clicking away saves, Esc cancels.
 */
export function AssignedCell({
  categoryId,
  categoryName,
  amount,
  format,
  actions,
  className,
  startEditing = false,
}: {
  categoryId: string;
  categoryName: string;
  amount: string;
  format: (minorUnits: string) => string;
  actions: AssignActions;
  className?: string;
  /** Opens in edit mode (once), as YNAB's "Copy and go to my plan" leaves it. */
  startEditing?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  // Enter commits and unmounts the input; the blur that follows must not commit again.
  const done = useRef(false);

  function start() {
    done.current = false;
    setText(actions.toInput(amount));
    setEditing(true);
  }

  useEffect(() => {
    if (startEditing) start();
  }, [startEditing]);

  async function commit() {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const parsed = actions.parse(text);
    if (typeof parsed === "string") {
      toast.error(parsed);
      return;
    }
    if (parsed !== BigInt(amount)) await actions.assign(categoryId, parsed);
  }

  if (editing) {
    return (
      <Input
        aria-label={`Assigned to ${categoryName}`}
        autoFocus
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            done.current = true;
            setEditing(false);
          }
        }}
        className={cn("h-7 text-right tabular-nums", className)}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={`Assigned to ${categoryName}: ${format(amount)}`}
      onClick={start}
      className={cn(
        "h-7 w-full truncate rounded-md border border-transparent px-2 text-right text-sm tabular-nums hover:border-input",
        className,
      )}
    >
      {format(amount)}
    </button>
  );
}
