import { Button } from "@everycent/ui/components/button";
import { Input } from "@everycent/ui/components/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@everycent/ui/components/input-group";
import { NativeSelect, NativeSelectOption } from "@everycent/ui/components/native-select";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Flag, flagLabel } from "@/lib/flags";
import {
  DATE_RANGE_LABELS,
  DATE_RANGES,
  type DateRange,
  isFiltered,
  type RegisterSearch,
} from "@/lib/register-filters";
import type { CategoryOption, Payee } from "@/lib/transactions";

const SEARCH_DELAY_MS = 300;

/**
 * Search and filters above the register. Typing waits a moment before searching so each
 * keystroke doesn't start a request; everything else applies at once.
 */
export function RegisterToolbar({
  search,
  onChange,
  categories,
  payees,
  flags,
}: {
  search: RegisterSearch;
  /** Patches the search; `replace` swaps the history entry instead of adding one (typing). */
  onChange: (patch: Partial<RegisterSearch>, replace?: boolean) => void;
  categories: readonly CategoryOption[];
  payees: readonly Payee[];
  flags: readonly Flag[];
}) {
  const [text, setText] = useState(search.q ?? "");
  // The address can change on its own (back button, "Clear filters"); follow it.
  const lastSent = useRef(search.q ?? "");
  useEffect(() => {
    if ((search.q ?? "") !== lastSent.current) {
      lastSent.current = search.q ?? "";
      setText(search.q ?? "");
    }
  }, [search.q]);
  useEffect(() => {
    if (text === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = text;
      onChange({ q: text.trim() ? text : undefined }, true);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, onChange]);

  const range = search.range ?? "all";

  return (
    <search className="flex flex-wrap items-center gap-2" aria-label="Find transactions">
      <InputGroup className="h-8 w-56">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          aria-label="Search transactions"
          placeholder="Search payee, memo, amount…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </InputGroup>
      <NativeSelect
        aria-label="Dates"
        value={range}
        onChange={(e) => {
          const next = e.target.value as DateRange;
          onChange({
            range: next === "all" ? undefined : next,
            ...(next === "custom" ? {} : { from: undefined, to: undefined }),
          });
        }}
        className="h-8"
      >
        {DATE_RANGES.map((r) => (
          <NativeSelectOption key={r} value={r}>
            {DATE_RANGE_LABELS[r]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {range === "custom" && (
        <>
          <Input
            type="date"
            aria-label="From"
            value={search.from ?? ""}
            max={search.to}
            onChange={(e) => onChange({ from: e.target.value || undefined })}
            className="h-8 w-36"
          />
          <Input
            type="date"
            aria-label="To"
            value={search.to ?? ""}
            min={search.from}
            onChange={(e) => onChange({ to: e.target.value || undefined })}
            className="h-8 w-36"
          />
        </>
      )}
      <NativeSelect
        aria-label="Cleared"
        value={search.cleared ?? ""}
        onChange={(e) =>
          onChange({ cleared: (e.target.value || undefined) as RegisterSearch["cleared"] })
        }
        className="h-8"
      >
        <NativeSelectOption value="">Any state</NativeSelectOption>
        <NativeSelectOption value="uncleared">Uncleared</NativeSelectOption>
        <NativeSelectOption value="cleared">Cleared</NativeSelectOption>
        <NativeSelectOption value="reconciled">Reconciled</NativeSelectOption>
      </NativeSelect>
      <NativeSelect
        aria-label="Flag"
        value={search.flag ?? ""}
        onChange={(e) =>
          onChange({ flag: (e.target.value || undefined) as RegisterSearch["flag"] })
        }
        className="h-8"
      >
        <NativeSelectOption value="">Any flag</NativeSelectOption>
        {flags.map((f) => (
          <NativeSelectOption key={f.color} value={f.color}>
            {flagLabel(f)}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value="none">No flag</NativeSelectOption>
      </NativeSelect>
      <NativeSelect
        aria-label="Category filter"
        value={search.categoryId ?? ""}
        onChange={(e) => onChange({ categoryId: e.target.value || undefined })}
        className="h-8 max-w-48"
      >
        <NativeSelectOption value="">Any category</NativeSelectOption>
        {categories.map((c) => (
          <NativeSelectOption key={c.id} value={c.id}>
            {c.group === "Inflow" ? `Inflow: ${c.name}` : `${c.group}: ${c.name}`}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Payee filter"
        value={search.payeeId ?? ""}
        onChange={(e) => onChange({ payeeId: e.target.value || undefined })}
        className="h-8 max-w-48"
      >
        <NativeSelectOption value="">Any payee</NativeSelectOption>
        {payees.map((p) => (
          <NativeSelectOption key={p.id} value={p.id}>
            {p.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {isFiltered(search) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            lastSent.current = "";
            setText("");
            onChange({
              q: undefined,
              range: undefined,
              from: undefined,
              to: undefined,
              cleared: undefined,
              flag: undefined,
              categoryId: undefined,
              payeeId: undefined,
            });
          }}
        >
          <X /> Clear filters
        </Button>
      )}
    </search>
  );
}
