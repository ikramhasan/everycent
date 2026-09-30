import { type CurrencyCode, isCurrencyCode } from "./currency";
import type {
  BudgetFormatSettings,
  CurrencySymbolPosition,
  DateFormat,
  NumberFormat,
} from "./format-settings";
import { DATE_FORMATS } from "./format-settings";

export interface SuggestedBudgetSettings extends BudgetFormatSettings {
  currency: CurrencyCode;
}

const EURO_REGIONS = [
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
];

/** Region → currency for the common cases; anything else falls back to USD. */
const REGION_CURRENCY: Record<string, string> = {
  ...Object.fromEntries(EURO_REGIONS.map((region) => [region, "EUR"])),
  AE: "AED",
  AR: "ARS",
  AU: "AUD",
  BD: "BDT",
  BR: "BRL",
  CA: "CAD",
  CH: "CHF",
  CL: "CLP",
  CN: "CNY",
  CO: "COP",
  CZ: "CZK",
  DK: "DKK",
  EG: "EGP",
  GB: "GBP",
  HK: "HKD",
  HU: "HUF",
  ID: "IDR",
  IL: "ILS",
  IN: "INR",
  IS: "ISK",
  JP: "JPY",
  KE: "KES",
  KR: "KRW",
  KW: "KWD",
  LK: "LKR",
  MX: "MXN",
  MY: "MYR",
  NG: "NGN",
  NO: "NOK",
  NP: "NPR",
  NZ: "NZD",
  PH: "PHP",
  PK: "PKR",
  PL: "PLN",
  RO: "RON",
  SA: "SAR",
  SE: "SEK",
  SG: "SGD",
  TH: "THB",
  TR: "TRY",
  TW: "TWD",
  UA: "UAH",
  US: "USD",
  VN: "VND",
  ZA: "ZAR",
};

function suggestCurrency(locale: Intl.Locale): CurrencyCode {
  const code = REGION_CURRENCY[locale.maximize().region ?? ""];
  return code && isCurrencyCode(code) ? code : "USD";
}

function suggestNumberFormat(locale: string): NumberFormat {
  // A numeric string, not a float: Intl formats strings exactly.
  const parts = new Intl.NumberFormat(locale, { numberingSystem: "latn" }).formatToParts(
    "1234567.5" as `${number}`,
  );
  const group = parts.find((p) => p.type === "group")?.value ?? ",";
  const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";
  const integers = parts.filter((p) => p.type === "integer").map((p) => p.value);

  if (integers.length === 3 && integers[0] === "12" && integers[1] === "34") return "indian";
  if (/[\s  ]/.test(group)) return decimal === "," ? "space_comma" : "space_dot";
  if (group === "'" || group === "’") return "apostrophe_dot";
  if (group === "." && decimal === ",") return "dot_comma";
  return "comma_dot";
}

function suggestDateFormat(locale: string): DateFormat {
  const parts = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
    numberingSystem: "latn",
    calendar: "gregory",
  }).formatToParts(new Date(Date.UTC(2026, 9, 1)));
  const order = parts
    .filter((p) => p.type === "year" || p.type === "month" || p.type === "day")
    .map((p) => p.type);
  const separator = parts.find((p) => p.type === "literal")?.value.trim() ?? "/";
  const token = { year: "YYYY", month: "MM", day: "DD" } as const;
  const candidate = order.map((t) => token[t as keyof typeof token]).join(separator);
  if ((DATE_FORMATS as readonly string[]).includes(candidate)) return candidate as DateFormat;

  const key = order.map((t) => t[0]).join("");
  if (key === "ymd") return "YYYY-MM-DD";
  if (key === "mdy") return "MM/DD/YYYY";
  return "DD/MM/YYYY";
}

function suggestSymbolPosition(locale: string, currency: CurrencyCode): CurrencySymbolPosition {
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(1);
  const symbolAt = parts.findIndex((p) => p.type === "currency");
  const numberAt = parts.findIndex((p) => p.type === "integer");
  return symbolAt !== -1 && symbolAt > numberAt ? "after" : "before";
}

/** Sensible defaults for a new budget, from a BCP 47 locale (typically `navigator.language`). */
export function suggestFormatSettings(localeTag: string): SuggestedBudgetSettings {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(localeTag);
  } catch {
    locale = new Intl.Locale("en-US");
  }
  const tag = locale.toString();
  const currency = suggestCurrency(locale);
  return {
    currency,
    numberFormat: suggestNumberFormat(tag),
    currencySymbolPosition: suggestSymbolPosition(tag, currency),
    dateFormat: suggestDateFormat(tag),
  };
}
