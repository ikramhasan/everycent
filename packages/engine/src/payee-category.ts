import { z } from "zod";

/**
 * How a payee picks the category of its next transaction, as Manage Payees' Categorization
 * section offers it: "Auto-categorize based on payee history", "Always use my choice" and
 * "Do not auto-categorize".
 */
export const PAYEE_CATEGORIZATIONS = ["auto", "always", "never"] as const;
export type PayeeCategorization = (typeof PAYEE_CATEGORIZATIONS)[number];
export const zPayeeCategorization = z.enum(PAYEE_CATEGORIZATIONS);

/**
 * The category a payee auto-categorizes to, from the categories of its transactions, oldest
 * first (split and uncategorized ones left out, as YNAB's "last 3 transactions" leaves them out).
 *
 * Checked in YNAB's register: the first categorization sets the default, and it only changes when
 * two of the payee's last three categorizations agree on another category (O1, O1, O2 stays O1;
 * O1, O2 stays O1; O1, O2, O2 becomes O2). `carried` is a default the payee had before this
 * history, such as one copied into a fresh start: it stands until two of three agree.
 */
export function payeeAutoCategory(
  history: readonly string[],
  carried: string | null = null,
): string | null {
  let current = carried;
  for (let i = 0; i < history.length; i++) {
    const window = history.slice(Math.max(0, i - 2), i + 1);
    const agreed = window.find((id, j) => window.indexOf(id) !== j);
    if (agreed !== undefined) current = agreed;
    else if (current === null) current = history[i] ?? null;
  }
  return current;
}

/** The category a new transaction for the payee starts with, by its Categorization setting. */
export function payeePrefillCategory(payee: {
  categorization: PayeeCategorization;
  /** The "Always use my choice" category. */
  defaultCategoryId: string | null;
  /** From `payeeAutoCategory`. */
  autoCategoryId: string | null;
}): string | null {
  switch (payee.categorization) {
    case "never":
      return null;
    case "always":
      return payee.defaultCategoryId ?? payee.autoCategoryId;
    default:
      return payee.autoCategoryId;
  }
}

/** How many "Suggested" categories YNAB lists for a payee. */
export const PAYEE_SUGGESTION_LIMIT = 5;

/**
 * The categories used with a payee, most recent first and each once, from the categories of its
 * transactions and split lines, newest first. Keeps one more than the picker shows, since the
 * selected category is left out of "Suggested".
 */
export function payeeRecentCategories(newestFirst: readonly string[]): string[] {
  const seen: string[] = [];
  for (const id of newestFirst) {
    if (!seen.includes(id)) seen.push(id);
    if (seen.length > PAYEE_SUGGESTION_LIMIT) break;
  }
  return seen;
}

/** YNAB's "Suggested" categories: the payee's recent ones other than the selected one, five at most. */
export function payeeSuggestions(recent: readonly string[], selected: string | null): string[] {
  return recent.filter((id) => id !== selected).slice(0, PAYEE_SUGGESTION_LIMIT);
}
