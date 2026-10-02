import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@everycent/ui/components/autocomplete";
import { InputGroupAddon, InputGroupButton } from "@everycent/ui/components/input-group";
import { cn } from "@everycent/ui/lib/utils";
import { Bookmark, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FLAG_CLASS } from "@/lib/flags";
import {
  currentFragment,
  type Suggestion,
  type SuggestionSources,
  searchSuggestions,
  withTerm,
} from "@/lib/search-suggestions";

/** A suggestion, carrying the whole text the box has once it's picked. */
type Item = Suggestion & { value: string };

/**
 * YNAB's register search: one box, everything else hidden. Typing suggests terms ("Payee:",
 * "Is: Cleared", "Outflow: >=25", …); picking one, or pressing Enter for free text, adds it to
 * the box and searches. Terms are comma separated and all must match.
 */
export function RegisterSearchBox({
  value,
  onCommit,
  placeholder,
  sources,
}: {
  /** The search applied now. */
  value: string;
  onCommit: (text: string) => void;
  placeholder: string;
  sources: SuggestionSources;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  // The address can change on its own (back button, "View All"); follow it.
  const applied = useRef(value);
  useEffect(() => {
    if (value !== applied.current) {
      applied.current = value;
      setText(value);
    }
  }, [value]);

  const items = useMemo<Item[]>(
    () =>
      searchSuggestions(currentFragment(text), sources).map((s) => ({
        ...s,
        value: withTerm(text, s.term),
      })),
    [text, sources],
  );
  const highlighted = useRef<Item | undefined>(undefined);

  function commit(next: string) {
    applied.current = next;
    setText(next);
    setOpen(false);
    onCommit(next);
  }

  return (
    <Autocomplete
      items={items}
      filter={null}
      value={text}
      open={open && items.length > 0}
      onOpenChange={setOpen}
      itemToStringValue={(item: Item) => item.value}
      onItemHighlighted={(item: Item | undefined) => {
        highlighted.current = item;
      }}
      onValueChange={(next, details) => {
        if (details.reason === "item-press") return commit(next);
        setText(next);
        setOpen(true);
        if (!next.trim() && applied.current) commit("");
      }}
    >
      <AutocompleteInput
        aria-label="Search transactions"
        placeholder={placeholder}
        showTrigger={false}
        className="h-8 w-64 focus-within:w-80 transition-[width]"
        onKeyDown={(e) => {
          // With no suggestion highlighted, Enter searches for what's typed, in any field.
          if (e.key !== "Enter" || highlighted.current) return;
          e.preventDefault();
          const fragment = currentFragment(text);
          commit(fragment ? withTerm(text, fragment) : text);
        }}
      >
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        {text && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              variant="ghost"
              aria-label="Clear search"
              onClick={() => commit("")}
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </AutocompleteInput>
      <AutocompleteContent align="end" className="w-96">
        <AutocompleteList>
          {(item: Item) => (
            <AutocompleteItem key={item.value} value={item} className="gap-3">
              <span className="w-20 shrink-0 text-right text-muted-foreground text-xs">
                {item.label}
              </span>
              {item.flag && (
                <Bookmark
                  className={cn(
                    "size-4",
                    item.flag === "none"
                      ? "text-muted-foreground"
                      : ["fill-current", FLAG_CLASS[item.flag]],
                  )}
                />
              )}
              <span className="truncate">{item.text}</span>
            </AutocompleteItem>
          )}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  );
}
