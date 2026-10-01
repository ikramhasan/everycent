import {
  type BudgetFormatSettings,
  type CurrencyCode,
  evaluateAmount,
  formatAmount,
  MoneyParseError,
  money,
} from "@everycent/engine";

export interface MoneySettings extends BudgetFormatSettings {
  currency: CurrencyCode;
}

/**
 * Reads an amount typed in the budget's number format, math included ("230+30"), into minor
 * units, or explains why not.
 */
export function parseMoneyInput(text: string, settings: MoneySettings): bigint | string {
  try {
    return evaluateAmount(text, settings.currency, settings.numberFormat).amount;
  } catch (error) {
    if (error instanceof MoneyParseError) {
      return `Enter an amount like ${formatAmount(money(123456n, settings.currency), {
        ...settings,
        currencySymbolPosition: "none",
      })}`;
    }
    throw error;
  }
}

/** Formats minor units for an input field (no symbol), e.g. "1,234.56". */
export function toMoneyInput(amount: string | bigint | null, settings: MoneySettings) {
  if (amount === null) return "";
  return formatAmount(money(BigInt(amount), settings.currency), {
    ...settings,
    currencySymbolPosition: "none",
  });
}
