import { CURRENCY_CODES, type CurrencyCode } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@everycent/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

const names = new Intl.DisplayNames(["en"], { type: "currency" });

export function currencyName(code: CurrencyCode): string {
  return names.of(code) ?? code;
}

export function CurrencyPicker({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {value} — {currencyName(value)}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search currencies…" />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup>
              {CURRENCY_CODES.map((code) => (
                <CommandItem
                  key={code}
                  value={`${code} ${currencyName(code)}`}
                  onSelect={() => {
                    onChange(code);
                    setOpen(false);
                  }}
                >
                  <span className="w-10 font-mono text-xs">{code}</span>
                  <span className="truncate">{currencyName(code)}</span>
                  {code === value && <CheckIcon className="ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
