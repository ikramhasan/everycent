import { type CurrencyCode, currencyExponent, money, NUMBER_FORMAT_SPECS } from "@everycent/engine";
import { useBudget } from "@/lib/budget-context";

/**
 * Amount labels for the net worth charts, always from exact minor units: `exact` for values,
 * `tick` for an axis tick (whole units; ticks are only positions), `masked` for Show Amounts off
 * (YNAB, 2026-10-17: "$•••••").
 */
export function useAmountFormat(currency: CurrencyCode) {
  const { budget, formatAmount } = useBudget();
  const exponent = currencyExponent(currency);
  const decimals = new RegExp(`\\${NUMBER_FORMAT_SPECS[budget.numberFormat].decimal}\\d+`);
  const exact = (minor: bigint | string) => formatAmount(money(BigInt(minor), currency));
  return {
    exact,
    tick: (units: number) =>
      formatAmount(money(BigInt(Math.round(units)) * 10n ** BigInt(exponent), currency)).replace(
        decimals,
        "",
      ),
    masked: exact(0n).replace(/\d[\d\s.,' ]*/, "•••••"),
  };
}
