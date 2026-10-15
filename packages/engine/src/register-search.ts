import type { CurrencyCode } from "./currency";
import { parseAmount } from "./format-amount";
import type { DateFormat, NumberFormat } from "./format-settings";

/**
 * YNAB's register search (web app): comma-separated terms, all of which must match (it's
 * additive, never subtractive). A term is either free text, found in any field, or
 * `Label: value` for one field, as the search suggestions write them:
 *
 *   `Payee: sto, Is: Cleared, Outflow: >=25,`
 *
 * Text matches ignore case and match anywhere in the name; a number on its own matches that
 * exact inflow or outflow. A term whose label or value isn't understood is searched as free
 * text, so nothing typed is ever silently dropped.
 */
export type SearchTerm =
  | { kind: "text"; text: string; amount: bigint | null }
  | { kind: "payee" | "category" | "memo" | "account"; text: string }
  /** `Category: Split`: split transactions. */
  | { kind: "split" }
  /** A flag color or the budget's name for one (resolved by the caller), or "none". */
  | { kind: "flag"; text: string }
  | { kind: "is"; state: IsState }
  | { kind: "amount"; direction: "outflow" | "inflow"; op: AmountOp; amount: bigint }
  | { kind: "date"; op: DateOp; date: string }
  /**
   * `Income: October 2026`: what went to or came from Ready to Assign in that month (`month`
   * 1–12). Without a year it's the current year, which the caller knows.
   */
  | { kind: "income"; month: number; year: number | null };

export const IS_STATES = [
  "uncleared",
  "cleared",
  "reconciled",
  "unreconciled",
  "cleared_or_reconciled",
] as const;
export type IsState = (typeof IS_STATES)[number];

/** How YNAB names each `Is:` state. */
export const IS_LABELS: Record<IsState, string> = {
  uncleared: "Uncleared",
  cleared: "Cleared",
  reconciled: "Reconciled",
  unreconciled: "Unreconciled",
  cleared_or_reconciled: "Cleared or Reconciled",
};

export type AmountOp = "eq" | "gte" | "lte";
export type DateOp = "on" | "before" | "after";

/** `On:` is that day; `Before:`/`After:` include the day itself ("On or before"). */
export const DATE_LABELS: Record<DateOp, string> = { on: "On", before: "Before", after: "After" };

/** English month names, as YNAB's `Income:` term reads and writes them. */
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** `Income: October 2026` for a month (1–12) of a year. */
export function incomeTerm(month: number, year: number) {
  return `Income: ${MONTH_NAMES[month - 1]} ${year}`;
}

export interface SearchSettings {
  currency: CurrencyCode;
  numberFormat: NumberFormat;
  dateFormat: DateFormat;
}

/** The terms of a search box's text. Empty terms (",,") are skipped. */
export function parseSearch(text: string, settings: SearchSettings): SearchTerm[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => parseTerm(t, settings));
}

function parseTerm(term: string, settings: SearchSettings): SearchTerm {
  const colon = term.indexOf(":");
  if (colon > 0) {
    const label = term.slice(0, colon).trim().toLowerCase();
    const value = term.slice(colon + 1).trim();
    const parsed = value ? labelled(label, value, settings) : null;
    if (parsed) return parsed;
  }
  return { kind: "text", text: term, amount: searchAmount(term, settings) };
}

function labelled(label: string, value: string, settings: SearchSettings): SearchTerm | null {
  switch (label) {
    case "payee":
    case "memo":
    case "account":
      return { kind: label, text: value };
    case "category":
      return value.toLowerCase() === "split"
        ? { kind: "split" }
        : { kind: "category", text: value };
    case "flag":
      return { kind: "flag", text: value };
    case "is": {
      const state = IS_STATES.find((s) => IS_LABELS[s].toLowerCase() === value.toLowerCase());
      return state ? { kind: "is", state } : null;
    }
    case "outflow":
    case "inflow": {
      const match = /^(>=|<=|=)?\s*(.+)$/.exec(value);
      const amount = match?.[2] ? searchAmount(match[2], settings) : null;
      if (amount === null) return null;
      const op: AmountOp = match?.[1] === ">=" ? "gte" : match?.[1] === "<=" ? "lte" : "eq";
      return { kind: "amount", direction: label, op, amount };
    }
    case "income":
      return parseIncomeMonth(value);
    case "on":
    case "before":
    case "after": {
      const date = parseDate(value, settings.dateFormat);
      return date ? { kind: "date", op: label, date } : null;
    }
    default:
      return null;
  }
}

/**
 * A month name, in full or its first three letters, in any case, then an optional four-digit year
 * ("October 2026", "oct", "OCTOBER"). YNAB reads nothing else ("10/2026", "Sept" match nothing).
 */
function parseIncomeMonth(value: string): SearchTerm | null {
  const match = /^([a-z]+)(?:\s+(\d{4}))?$/i.exec(value);
  if (!match?.[1]) return null;
  const name = match[1].toLowerCase();
  const index = MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === name || m.slice(0, 3).toLowerCase() === name,
  );
  if (index < 0) return null;
  return { kind: "income", month: index + 1, year: match[2] ? Number(match[2]) : null };
}

/** The unsigned amount (minor units) `text` reads as, if it's a number. */
function searchAmount(text: string, settings: SearchSettings): bigint | null {
  try {
    const { amount } = parseAmount(
      text.trim().replace(/^[-+]/, ""),
      settings.currency,
      settings.numberFormat,
    );
    return amount < 0n ? -amount : amount;
  } catch {
    return null;
  }
}

/**
 * A full date typed in the budget's date format (any of `/ . -` between the parts, single digits
 * allowed) as YYYY-MM-DD, or null.
 */
export function parseDate(text: string, format: DateFormat): string | null {
  const parts = text.trim().split(/[/.-]/);
  const order = format.split(/[/.-]/);
  if (parts.length !== 3 || order.length !== 3) return null;
  const value: Record<string, number> = {};
  for (const [i, key] of order.entries()) {
    const part = parts[i] ?? "";
    if (!/^\d+$/.test(part)) return null;
    if (key === "YYYY" ? part.length !== 4 : part.length > 2) return null;
    value[key] = Number(part);
  }
  const { YYYY: y = 0, MM: m = 0, DD: d = 0 } = value;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
