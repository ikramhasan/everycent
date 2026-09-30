import { Button } from "@everycent/ui/components/button";
import { Input } from "@everycent/ui/components/input";
import { Label } from "@everycent/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { Textarea } from "@everycent/ui/components/textarea";
import { type FormEvent, type ReactNode, useId, useState } from "react";

export interface NameValues {
  name: string;
  note: string;
}

/**
 * YNAB-style inline editor: a popover with a name field (and optionally a note), OK/Cancel, and
 * any extra actions (Hide, Delete) the caller passes in.
 */
export function NamePopover({
  trigger,
  title,
  initial = { name: "", note: "" },
  withNote = false,
  submitLabel = "OK",
  onSubmit,
  actions,
}: {
  trigger: ReactNode;
  title: string;
  initial?: NameValues;
  withNote?: boolean;
  submitLabel?: string;
  onSubmit: (values: NameValues) => Promise<void> | void;
  /** Extra buttons; call `close()` when one finishes. */
  actions?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const id = useId();

  function handleOpenChange(next: boolean) {
    if (next) setValues(initial);
    setOpen(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = values.name.trim();
    if (!name) return;
    setPending(true);
    try {
      await onSubmit({ name, note: values.note });
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>{title}</Label>
            <Input
              id={`${id}-name`}
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              maxLength={100}
              autoFocus
              required
            />
          </div>
          {withNote && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-note`}>Note</Label>
              <Textarea
                id={`${id}-note`}
                value={values.note}
                onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
                rows={3}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {actions?.(() => setOpen(false))}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending || !values.name.trim()}>
                {submitLabel}
              </Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
