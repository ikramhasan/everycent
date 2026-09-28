import { type CurrencyCode, currencyExponent } from "./currency";
import { MoneyParseError } from "./errors";
import { type Money, money } from "./money";

const DECIMAL = /^([+-])?(\d*)(?:\.(\d*))?$/;

/**
 * Parses a user-entered decimal string ("1,234.56") into exact minor units.
 * Uses "." as the decimal separator; "," "_" and whitespace are treated as grouping.
 * Never rounds: more fraction digits than the currency allows is an error.
 */
export function parseMoney(input: string, currency: CurrencyCode): Money {
  const cleaned = input.trim().replace(/[,_\s]/g, "");
  const match = DECIMAL.exec(cleaned);
  const whole = match?.[2] ?? "";
  const fraction = match?.[3] ?? "";
  if (!match || (whole === "" && fraction === "")) {
    throw new MoneyParseError(input, "not a decimal number");
  }

  const exponent = currencyExponent(currency);
  if (fraction.length > exponent) {
    throw new MoneyParseError(input, `${currency} allows at most ${exponent} decimal places`);
  }

  const magnitude = BigInt(`${whole || "0"}${fraction.padEnd(exponent, "0")}`);
  return money(match[1] === "-" ? -magnitude : magnitude, currency);
}

/** Exact decimal representation, e.g. 1234n USD -> "12.34". Never goes through a float. */
export function toDecimalString(m: Money): string {
  const exponent = currencyExponent(m.currency);
  const negative = m.amount < 0n;
  const digits = (negative ? -m.amount : m.amount).toString().padStart(exponent + 1, "0");
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${negative ? "-" : ""}${whole}${exponent > 0 ? `.${fraction}` : ""}`;
}

export interface FormatMoneyOptions {
  locale?: string;
  currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name";
}

export function formatMoney(m: Money, options: FormatMoneyOptions = {}): string {
  const exponent = currencyExponent(m.currency);
  const formatter = new Intl.NumberFormat(options.locale ?? "en-US", {
    style: "currency",
    currency: m.currency,
    currencyDisplay: options.currencyDisplay ?? "symbol",
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
  // Intl.NumberFormat formats numeric strings exactly (ES2023), so no float precision loss.
  return formatter.format(toDecimalString(m) as `${number}`);
}
