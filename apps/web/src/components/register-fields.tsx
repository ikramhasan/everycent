import {
  type DateFormat,
  formatDate,
  SCHEDULE_FREQUENCIES,
  SCHEDULE_FREQUENCY_LABELS,
  type ScheduleFrequency,
} from "@everycent/engine";
import {
  Autocomplete,
  AutocompleteCollection,
  AutocompleteContent,
  AutocompleteGroup,
  AutocompleteGroupLabel,
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
import { Label } from "@everycent/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@everycent/ui/components/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { ArrowLeftRight, CalendarDays, Plus, Split } from "lucide-react";
import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import { dateToIso, isoToDate, parseDateInput } from "@/lib/dates";
import { type CategoryOption, categoryLabel, type Payee, transferLabel } from "@/lib/transactions";

/**
 * True when a key belongs to a field's open suggestion list rather than to the row: Esc closes
 * the list, and Enter picks the highlighted item. With nothing highlighted, Enter saves what's in
 * the field. (Base UI handles the key first, but the attributes still read as they were while
 * the event bubbles.)
 */
export function listOwnsKey(event: { key: string; target: EventTarget | null }) {
  const { target } = event;
  if (!(target instanceof HTMLElement) || target.getAttribute("aria-expanded") !== "true") {
    return false;
  }
  return event.key !== "Enter" || target.hasAttribute("aria-activedescendant");
}

/** Focus moved into one of a field's popups (they're portalled, so outside the cell's DOM). */
export function isInsidePopup(node: EventTarget | null) {
  return (
    node instanceof Element &&
    node.closest("[data-slot=popover-content],[data-slot=combobox-content]") !== null
  );
}

/**
 * A date typed in the budget's format ("10/5" works too), with a calendar to pick from. With
 * `repeat`, the calendar has YNAB's "Repeat:" select under it (new and scheduled transactions).
 */
export function DateField({
  value,
  onChange,
  onPick,
  format,
  autoFocus,
  repeat,
}: {
  value: string;
  onChange: (iso: string) => void;
  /** A day was chosen in the calendar. */
  onPick?: (iso: string) => void;
  format: DateFormat;
  autoFocus?: boolean;
  repeat?: { value: ScheduleFrequency; onChange: (frequency: ScheduleFrequency) => void };
}) {
  const display = (iso: string) => formatDate(iso, format);
  const [text, setText] = useState(() => display(value));
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const repeatId = useId();

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
            {repeat && (
              <div className="grid gap-1.5 border-t p-3">
                <Label htmlFor={repeatId} className="text-xs">
                  Repeat:
                </Label>
                <NativeSelect
                  id={repeatId}
                  value={repeat.value}
                  onChange={(e) => repeat.onChange(e.target.value as ScheduleFrequency)}
                  className="h-8 w-full"
                >
                  {SCHEDULE_FREQUENCIES.map((f) => (
                    <NativeSelectOption key={f} value={f}>
                      {SCHEDULE_FREQUENCY_LABELS[f]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  );
}

type PayeeItem = {
  id: string;
  label: string;
  kind: "payee" | "transfer" | "create";
  /** Transfers: the other account. */
  accountName?: string;
};

interface PayeeGroup {
  value: string;
  items: PayeeItem[];
}

/** An account a transfer can go to. */
export interface TransferTarget {
  id: string;
  name: string;
}

/** What a payee field holds: a payee name, or a transfer to another account. */
export interface PayeeChoice {
  name: string;
  transferAccountId: string | null;
  /** An existing payee was picked from the list (to suggest its last category). */
  payee?: Payee;
}

/**
 * Payee name with suggestions, plus YNAB's transfers: "Transfer : <account>" for each account
 * money can move to. Typing a new name is fine (it's created on save); YNAB also lists "Create
 * payee" so it's clear that's what will happen.
 */
export function PayeeField({
  label = "Payee",
  value,
  onChange,
  onPick,
  payees,
  transfers,
  autoFocus,
}: {
  /** Accessible name (split lines say which line). */
  label?: string;
  value: string;
  onChange: (choice: PayeeChoice) => void;
  /** An item in the list was chosen. */
  onPick?: (choice: PayeeChoice) => void;
  payees: readonly Payee[];
  transfers: readonly TransferTarget[];
  autoFocus?: boolean;
}) {
  const trimmed = value.trim();
  const groups = useMemo<PayeeGroup[]>(() => {
    const known: PayeeItem[] = payees.map((p) => ({ id: p.id, label: p.name, kind: "payee" }));
    const toAccounts: PayeeItem[] = transfers.map((a) => ({
      id: `transfer:${a.id}`,
      label: transferLabel(a.name),
      kind: "transfer",
      accountName: a.name,
    }));
    const exact = [...known, ...toAccounts].some(
      (p) => p.label.toLowerCase() === trimmed.toLowerCase(),
    );
    // Payees first and "Create payee" last, so autocomplete picks an existing payee first.
    return [
      { value: "Payees", items: known },
      { value: "Transfers", items: toAccounts },
      ...(trimmed && !exact
        ? [{ value: "", items: [{ id: "create", label: trimmed, kind: "create" as const }] }]
        : []),
    ].filter((g) => g.items.length > 0);
  }, [payees, transfers, trimmed]);

  // Item presses report only the text; the highlighted item tells transfers to two accounts
  // with the same name apart.
  const highlighted = useRef<PayeeItem | undefined>(undefined);
  function choose(text: string, picked?: PayeeItem): PayeeChoice {
    const match = (p: { label: string }) => p.label.toLowerCase() === text.trim().toLowerCase();
    const item =
      picked && picked.label === text ? picked : groups.flatMap((g) => g.items).find(match);
    if (item?.kind === "transfer") {
      return { name: item.label, transferAccountId: item.id.slice("transfer:".length) };
    }
    return { name: text, transferAccountId: null, payee: payees.find((p) => p.name === text) };
  }

  // YNAB shows the whole list as soon as the field is focused, with the current payee selected so
  // typing replaces it; the list narrows once something is typed.
  const [open, setOpen] = useState(Boolean(autoFocus));
  const [typed, setTyped] = useState(false);
  return (
    <Autocomplete
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTyped(false);
      }}
      items={groups}
      filter={typed ? undefined : null}
      value={value}
      onItemHighlighted={(item: PayeeItem | undefined) => {
        highlighted.current = item;
      }}
      onValueChange={(text, details) => {
        if (details.reason === "input-change") setTyped(true);
        const pressed = details.reason === "item-press";
        const choice = choose(text, pressed ? highlighted.current : undefined);
        onChange(pressed ? choice : { ...choice, payee: undefined });
        if (pressed) onPick?.(choice);
      }}
      itemToStringValue={(item: PayeeItem) => item.label}
      // Until something is typed, Enter keeps the payee instead of picking the first one.
      autoHighlight={typed}
    >
      <AutocompleteInput
        aria-label={label}
        placeholder="Payee"
        showTrigger={false}
        autoFocus={autoFocus}
        onFocus={(e) => {
          setOpen(true);
          e.currentTarget.select();
        }}
        className="h-8 w-full"
      />
      <AutocompleteContent className="min-w-64">
        <AutocompleteList>
          {(group: PayeeGroup) => (
            <AutocompleteGroup key={group.value} items={group.items}>
              {group.value && <AutocompleteGroupLabel>{group.value}</AutocompleteGroupLabel>}
              <AutocompleteCollection>
                {(item: PayeeItem) => (
                  <AutocompleteItem key={item.id} value={item}>
                    {item.kind === "create" ? (
                      <>
                        <Plus className="size-4" /> Create payee “{item.label}”
                      </>
                    ) : item.kind === "transfer" ? (
                      <>
                        <ArrowLeftRight className="size-4 text-muted-foreground" />
                        {item.accountName}
                      </>
                    ) : (
                      item.label
                    )}
                  </AutocompleteItem>
                )}
              </AutocompleteCollection>
            </AutocompleteGroup>
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

/** The "Split" entry at the end of the category list. */
const SPLIT: CategoryOption = { id: "__split", name: "Split", group: "" };

/**
 * Category picker grouped like the budget; clearing it means Uncategorized. With `onSplit`, the
 * list ends with YNAB's "Split", to spread the transaction across several categories.
 */
export function CategoryField({
  label = "Category",
  value,
  onChange,
  onSplit,
  categories,
  autoFocus,
  placeholder = "Uncategorized",
  describe,
}: {
  label?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  onSplit?: () => void;
  categories: readonly CategoryOption[];
  autoFocus?: boolean;
  placeholder?: string;
  /** Extra text at the end of an option, e.g. what's available in it. */
  describe?: (option: CategoryOption) => ReactNode;
}) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, CategoryOption[]>();
    for (const c of categories) byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]);
    const list = [...byGroup].map(
      ([group, items]): CategoryGroupItems => ({ value: group, items }),
    );
    return onSplit ? [...list, { value: "", items: [SPLIT] }] : list;
  }, [categories, onSplit]);
  const selected = categories.find((c) => c.id === value) ?? null;
  const [open, setOpen] = useState(Boolean(autoFocus));

  return (
    <Combobox<CategoryOption>
      open={open}
      onOpenChange={setOpen}
      items={groups}
      value={selected}
      onValueChange={(option) => {
        if (option?.id === SPLIT.id) onSplit?.();
        else onChange(option?.id ?? null);
      }}
      itemToStringLabel={categoryLabel}
      isItemEqualToValue={(a, b) => a.id === b.id}
      autoHighlight
    >
      <ComboboxInput
        aria-label={label}
        placeholder={placeholder}
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
              {group.value && <ComboboxLabel>{group.value}</ComboboxLabel>}
              <ComboboxCollection>
                {(option: CategoryOption) => (
                  <ComboboxItem key={option.id} value={option}>
                    {option.id === SPLIT.id ? (
                      <>
                        <Split className="size-4 text-muted-foreground" /> Split
                      </>
                    ) : describe ? (
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="truncate">{option.name}</span>
                        <span className="shrink-0 tabular-nums">{describe(option)}</span>
                      </span>
                    ) : (
                      option.name
                    )}
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
