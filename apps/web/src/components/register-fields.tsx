import { type DateFormat, formatDate } from "@everycent/engine";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@everycent/ui/components/autocomplete";
import { Calendar } from "@everycent/ui/components/calendar";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@everycent/ui/components/combobox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@everycent/ui/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { CalendarDays, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { dateToIso, isoToDate, parseDateInput } from "@/lib/dates";
import { type CategoryOption, categoryLabel, type Payee } from "@/lib/transactions";

/**
 * True while a field's suggestion list is open: Enter and Esc then belong to the list, not to
 * the row (Base UI handles them first, but the attribute still reads "true" as the event bubbles).
 */
export function isListOpen(target: EventTarget | null) {
  return target instanceof HTMLElement && target.getAttribute("aria-expanded") === "true";
}

/** Focus moved into one of a field's popups (they're portalled, so outside the cell's DOM). */
export function isInsidePopup(node: EventTarget | null) {
  return (
    node instanceof Element &&
    node.closest("[data-slot=popover-content],[data-slot=combobox-content]") !== null
  );
}

/** A date typed in the budget's format ("10/5" works too), with a calendar to pick from. */
export function DateField({
  value,
  onChange,
  onPick,
  format,
  autoFocus,
}: {
  value: string;
  onChange: (iso: string) => void;
  /** A day was chosen in the calendar. */
  onPick?: (iso: string) => void;
  format: DateFormat;
  autoFocus?: boolean;
}) {
  const display = (iso: string) => formatDate(iso, format);
  const [text, setText] = useState(() => display(value));
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <InputGroup className="h-8">
      <InputGroupInput
        ref={inputRef}
        aria-label="Date"
        value={text}
        autoFocus={autoFocus}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setText(e.target.value);
          const iso = parseDateInput(e.target.value, format);
          if (iso) onChange(iso);
        }}
        onBlur={() => setText(display(value))}
        className="tabular-nums"
      />
      <InputGroupAddon align="inline-end">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <InputGroupButton size="icon-xs" aria-label="Pick a date" tabIndex={-1}>
              <CalendarDays />
            </InputGroupButton>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={isoToDate(value)}
              defaultMonth={isoToDate(value)}
              onSelect={(date) => {
                if (!date) return;
                const iso = dateToIso(date);
                onChange(iso);
                setText(display(iso));
                setOpen(false);
                inputRef.current?.focus();
                onPick?.(iso);
              }}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  );
}

type PayeeItem = { id: string; label: string; create?: boolean };

/**
 * Payee name with suggestions. Typing a new name is fine (it's created on save); YNAB also lists
 * "Create payee" so it's clear that's what will happen.
 */
export function PayeeField({
  value,
  onChange,
  onPick,
  payees,
  autoFocus,
}: {
  value: string;
  /** `payee` is set when an existing one was picked (to suggest its last category). */
  onChange: (name: string, payee?: Payee) => void;
  /** An item in the list was chosen. */
  onPick?: (name: string) => void;
  payees: readonly Payee[];
  autoFocus?: boolean;
}) {
  const trimmed = value.trim();
  const items = useMemo<PayeeItem[]>(() => {
    const known = payees.map((p) => ({ id: p.id, label: p.name }));
    const exact = known.some((p) => p.label.toLowerCase() === trimmed.toLowerCase());
    // Last, so autocomplete picks an existing payee first, as in YNAB.
    return trimmed && !exact ? [...known, { id: "create", label: trimmed, create: true }] : known;
  }, [payees, trimmed]);

  // YNAB shows the list as soon as the field is focused.
  const [open, setOpen] = useState(Boolean(autoFocus));
  return (
    <Autocomplete
      open={open}
      onOpenChange={setOpen}
      items={items}
      value={value}
      onValueChange={(text, details) => {
        const payee = payees.find((p) => p.name === text);
        onChange(text, details.reason === "item-press" ? payee : undefined);
        if (details.reason === "item-press") onPick?.(text);
      }}
      itemToStringValue={(item: PayeeItem) => item.label}
      autoHighlight
    >
      <AutocompleteInput
        aria-label="Payee"
        placeholder="Payee"
        showTrigger={false}
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        className="h-8 w-full"
      />
      <AutocompleteContent>
        <AutocompleteList>
          {(item: PayeeItem) => (
            <AutocompleteItem key={item.id} value={item}>
              {item.create ? (
                <>
                  <Plus className="size-4" /> Create payee “{item.label}”
                </>
              ) : (
                item.label
              )}
            </AutocompleteItem>
          )}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  );
}

interface CategoryGroupItems {
  value: string;
  items: CategoryOption[];
}

/** Category picker grouped like the budget; clearing it means Uncategorized. */
export function CategoryField({
  value,
  onChange,
  categories,
  autoFocus,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  categories: readonly CategoryOption[];
  autoFocus?: boolean;
}) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, CategoryOption[]>();
    for (const c of categories) byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]);
    return [...byGroup].map(([group, items]): CategoryGroupItems => ({ value: group, items }));
  }, [categories]);
  const selected = categories.find((c) => c.id === value) ?? null;
  const [open, setOpen] = useState(Boolean(autoFocus));

  return (
    <Combobox<CategoryOption>
      open={open}
      onOpenChange={setOpen}
      items={groups}
      value={selected}
      onValueChange={(option) => onChange(option?.id ?? null)}
      itemToStringLabel={categoryLabel}
      isItemEqualToValue={(a, b) => a.id === b.id}
      autoHighlight
    >
      <ComboboxInput
        aria-label="Category"
        placeholder="Uncategorized"
        showTrigger={false}
        showClear={selected !== null}
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        className="h-8 w-full"
      />
      <ComboboxContent className="min-w-64">
        <ComboboxEmpty>No matching category</ComboboxEmpty>
        <ComboboxList>
          {(group: CategoryGroupItems) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(option: CategoryOption) => (
                  <ComboboxItem key={option.id} value={option}>
                    {option.name}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
