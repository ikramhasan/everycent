import {
  type AccountType,
  type DateFormat,
  formatDate,
  payeeSuggestions,
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
import { Button } from "@everycent/ui/components/button";
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
import {
  type CategoryOption,
  categoryLabel,
  type Payee,
  type TransferDirection,
  transferChoiceLabel,
  transferLabel,
} from "@/lib/transactions";
import { useManagePayees } from "./manage-payees";

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
  onMakeRepeating,
  defaultOpen = false,
}: {
  value: string;
  onChange: (iso: string) => void;
  /** A day was chosen in the calendar. */
  onPick?: (iso: string) => void;
  format: DateFormat;
  autoFocus?: boolean;
  repeat?: { value: ScheduleFrequency; onChange: (frequency: ScheduleFrequency) => void };
  /** A plain transaction's date picker offers YNAB's "Make Repeating" instead. */
  onMakeRepeating?: () => void;
  /** Start with the calendar open (Make Repeating's new row, as YNAB opens it). */
  defaultOpen?: boolean;
}) {
  const display = (iso: string) => formatDate(iso, format);
  const [text, setText] = useState(() => display(value));
  const [open, setOpen] = useState(defaultOpen);
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
            {onMakeRepeating && (
              <div className="border-t p-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setOpen(false);
                    onMakeRepeating();
                  }}
                >
                  Make Repeating
                </Button>
              </div>
            )}
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
  /** Transfers: what the list shows (YNAB's wording, or just the account's name). */
  text?: string;
};

/** Typed text names this item; a transfer also answers to its stored "Transfer : X". */
function matches(item: PayeeItem, text: string) {
  const lower = text.toLowerCase();
  return (
    item.label.toLowerCase() === lower ||
    (item.kind === "transfer" &&
      item.accountName !== undefined &&
      transferLabel(item.accountName).toLowerCase() === lower)
  );
}

interface PayeeGroup {
  value: string;
  items: PayeeItem[];
}

/** An account a transfer can go to. */
export interface TransferTarget {
  id: string;
  name: string;
  /** With the editing account's `own`, names the transfer as YNAB does ("Payment from X"). */
  type?: AccountType;
}

/** What a payee field holds: a payee name, or a transfer to another account. */
export interface PayeeChoice {
  name: string;
  transferAccountId: string | null;
  /** An existing payee was picked from the list (to suggest its last category). */
  payee?: Payee;
}

/**
 * Payee name with suggestions, plus YNAB's "Payments and Transfers" for each account money can
 * move to, worded by `own` and the amount's direction (`transferChoiceLabel`: "Payment from F
 * Cash", "Transfer to Savings", "To/From X"); "Transfer : <account>" without `own`. Typing a new
 * name is fine (it's created on save); YNAB also lists "Create payee" so it's clear that's what
 * will happen.
 */
export function PayeeField({
  label = "Payee",
  value,
  onChange,
  onPick,
  payees,
  transfers,
  own,
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
  /** The account being edited and which way its amount goes. */
  own?: { type: AccountType; direction: TransferDirection };
  autoFocus?: boolean;
}) {
  const trimmed = value.trim();
  const managePayees = useManagePayees();
  // Hidden payees aren't suggested, but typing one's exact name still uses it (YNAB).
  const hiddenMatch = payees.some(
    (p) => p.hidden && p.name.toLowerCase() === trimmed.toLowerCase(),
  );
  // YNAB shows the whole list as soon as the field is focused, with the current payee selected so
  // typing replaces it; the list narrows once something is typed.
  const [open, setOpen] = useState(Boolean(autoFocus));
  const [typed, setTyped] = useState(false);
  const groups = useMemo<PayeeGroup[]>(() => {
    const known: PayeeItem[] = payees
      .filter((p) => !p.hidden)
      .map((p) => ({ id: p.id, label: p.name, kind: "payee" }));
    const toAccounts: PayeeItem[] = transfers.map((a) => {
      const worded =
        own && a.type
          ? transferChoiceLabel(own.type, { name: a.name, type: a.type }, own.direction)
          : null;
      return {
        id: `transfer:${a.id}`,
        label: worded ?? transferLabel(a.name),
        kind: "transfer",
        accountName: a.name,
        text: worded ?? a.name,
      };
    });
    const exact = [...known, ...toAccounts].some((p) => matches(p, trimmed));
    // YNAB (2026-10-16): the whole list starts with "Payments and Transfers", then "Saved
    // Payees"; once something is typed, saved payees come first. "Create payee" stays last here
    // (YNAB puts it on top), so autocomplete still picks an existing payee first.
    const saved = { value: "Saved Payees", items: known };
    const moves = { value: "Payments and Transfers", items: toAccounts };
    return [
      ...(typed ? [saved, moves] : [moves, saved]),
      ...(trimmed && !exact && !hiddenMatch
        ? [{ value: "", items: [{ id: "create", label: trimmed, kind: "create" as const }] }]
        : []),
    ].filter((g) => g.items.length > 0);
  }, [payees, transfers, own, trimmed, hiddenMatch, typed]);

  // Item presses report only the text; the highlighted item tells transfers to two accounts
  // with the same name apart.
  const highlighted = useRef<PayeeItem | undefined>(undefined);
  function choose(text: string, picked?: PayeeItem): PayeeChoice {
    const item =
      picked && picked.label === text
        ? picked
        : groups.flatMap((g) => g.items).find((p) => matches(p, text.trim()));
    if (item?.kind === "transfer") {
      return { name: item.label, transferAccountId: item.id.slice("transfer:".length) };
    }
    return { name: text, transferAccountId: null, payee: payees.find((p) => p.name === text) };
  }

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
                        {item.text}
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
        {hiddenMatch && (
          <p className="px-2 py-1.5 text-muted-foreground text-xs">1 matching payee is hidden</p>
        )}
        {managePayees && (
          <button
            type="button"
            className="w-full border-t px-2 py-1.5 text-left text-primary text-sm hover:underline"
            // Keep focus in the field until the dialog takes it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(false);
              managePayees();
            }}
          >
            Manage Payees
          </button>
        )}
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
/** YNAB's "Payment/Transfer" button at the end of the category list. */
const PAYMENT_TRANSFER: CategoryOption = {
  id: "__payment_transfer",
  name: "Payment/Transfer",
  group: "",
};

/** Copies of categories listed again under "Selected" or "Suggested", told apart by id. */
const SHORTCUT = "__shortcut:";
const shortcut = (option: CategoryOption) => ({ ...option, id: `${SHORTCUT}${option.id}` });

/**
 * YNAB's sections above the groups once a known payee is picked: "Selected" (the category in the
 * field) and "Suggested" (the payee's other recent categories). They make way for the matches as
 * soon as something is typed.
 */
function shortcutGroups(
  categories: readonly CategoryOption[],
  selected: CategoryOption | null,
  suggestedIds: readonly string[],
): CategoryGroupItems[] {
  const listed = suggestedIds.filter((id) => categories.some((c) => c.id === id));
  const suggested = payeeSuggestions(listed, selected?.id ?? null)
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is CategoryOption => c !== undefined);
  return [
    ...(selected ? [{ value: "Selected", items: [shortcut(selected)] }] : []),
    ...(suggested.length > 0 ? [{ value: "Suggested", items: suggested.map(shortcut) }] : []),
  ];
}

/**
 * Category picker grouped like the budget; clearing it means Uncategorized. With `onSplit`, the
 * list ends with YNAB's "Split", to spread the transaction across several categories; with
 * `onPaymentTransfer`, with its "Payment/Transfer" (before Split, in cash and card registers alike;
 * 2026-10-16), which goes to the payee list to pick an account. With `suggestedIds` (a payee's
 * recent categories), it starts with YNAB's "Selected" and "Suggested".
 */
export function CategoryField({
  label = "Category",
  value,
  onChange,
  onSplit,
  onPaymentTransfer,
  categories,
  autoFocus,
  placeholder = "Uncategorized",
  describe,
  suggestedIds,
}: {
  label?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  onSplit?: () => void;
  onPaymentTransfer?: () => void;
  categories: readonly CategoryOption[];
  autoFocus?: boolean;
  placeholder?: string;
  /** Extra text at the end of an option, e.g. what's available in it. */
  describe?: (option: CategoryOption) => ReactNode;
  /** The payee's recent categories, most recent first (see `payeeSuggestions`). */
  suggestedIds?: readonly string[];
}) {
  const selected = categories.find((c) => c.id === value) ?? null;
  const [query, setQuery] = useState("");
  const typing = query.trim() !== "" && (!selected || query !== categoryLabel(selected));
  const groups = useMemo(() => {
    const byGroup = new Map<string, CategoryOption[]>();
    for (const c of categories) byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]);
    const list = [...byGroup].map(
      ([group, items]): CategoryGroupItems => ({ value: group, items }),
    );
    const actions = [...(onPaymentTransfer ? [PAYMENT_TRANSFER] : []), ...(onSplit ? [SPLIT] : [])];
    const shortcuts =
      suggestedIds && !typing ? shortcutGroups(categories, selected, suggestedIds) : [];
    return [...shortcuts, ...list, ...(actions.length > 0 ? [{ value: "", items: actions }] : [])];
  }, [categories, onSplit, onPaymentTransfer, suggestedIds, typing, selected]);
  // With the shortcuts, the "Selected" entry is the one ticked, so the list opens at the top.
  const shown = useMemo(
    () => (selected && suggestedIds ? shortcut(selected) : selected),
    [selected, suggestedIds],
  );
  const [open, setOpen] = useState(Boolean(autoFocus));

  return (
    <Combobox<CategoryOption>
      open={open}
      onOpenChange={setOpen}
      items={groups}
      value={shown}
      onInputValueChange={setQuery}
      onValueChange={(option) => {
        if (option?.id === SPLIT.id) onSplit?.();
        else if (option?.id === PAYMENT_TRANSFER.id) {
          setOpen(false);
          onPaymentTransfer?.();
        } else onChange(option?.id.replace(SHORTCUT, "") ?? null);
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
                    ) : option.id === PAYMENT_TRANSFER.id ? (
                      <>
                        <ArrowLeftRight className="size-4 text-muted-foreground" /> Payment/Transfer
                      </>
                    ) : option.id.startsWith(SHORTCUT) ? (
                      // YNAB: "O2 (Test)", the group in parentheses.
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="truncate">
                          {option.name}{" "}
                          <span className="text-muted-foreground">({option.group})</span>
                        </span>
                        {describe && (
                          <span className="shrink-0 tabular-nums">
                            {describe({ ...option, id: option.id.replace(SHORTCUT, "") })}
                          </span>
                        )}
                      </span>
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
