import type { DateFormat } from "@everycent/engine";
import { format as format_, isValid, parse } from "date-fns";

/** The user's local calendar date as YYYY-MM-DD (what YNAB means by "today"). */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const PATTERNS: Record<DateFormat, string> = {
  "MM/DD/YYYY": "MM/dd/yyyy",
  "DD/MM/YYYY": "dd/MM/yyyy",
  "YYYY-MM-DD": "yyyy-MM-dd",
  "DD.MM.YYYY": "dd.MM.yyyy",
  "YYYY/MM/DD": "yyyy/MM/dd",
  "DD-MM-YYYY": "dd-MM-yyyy",
};

/** The same pattern with the year left out, e.g. "MM/dd" ("10/5" means this year's Oct 5). */
function withoutYear(pattern: string) {
  return pattern.replace(/^yyyy\W|\Wyyyy$/, "");
}

/**
 * Reads a date typed in the budget's format into YYYY-MM-DD, or null if it isn't one. Single
 * digits and a missing year (meaning `reference`'s year) are fine, as in YNAB's date field.
 */
export function parseDateInput(text: string, format: DateFormat, reference = new Date()) {
  const trimmed = text.trim();
  for (const pattern of [PATTERNS[format], withoutYear(PATTERNS[format])]) {
    const loose = pattern.replace("dd", "d").replace("MM", "M");
    const date = parse(trimmed, loose, reference);
    if (isValid(date) && date.getFullYear() >= 1900) return format_(date, "yyyy-MM-dd");
  }
  return null;
}

/** YYYY-MM-DD ↔ a local Date at midnight (for the calendar). */
export const isoToDate = (iso: string) => parse(iso, "yyyy-MM-dd", new Date());
export const dateToIso = (date: Date) => format_(date, "yyyy-MM-dd");
