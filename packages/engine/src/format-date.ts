import type { DateFormat } from "./format-settings";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Formats a calendar date ("2026-10-01") in the budget's date format. No timezone involved. */
export function formatDate(isoDate: string, dateFormat: DateFormat): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new RangeError(`Expected a YYYY-MM-DD date, got "${isoDate}"`);
  const [, yyyy = "", mm = "", dd = ""] = match;
  return dateFormat.replace("YYYY", yyyy).replace("MM", mm).replace("DD", dd);
}
