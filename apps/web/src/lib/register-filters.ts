import { z } from "zod";
import { type RegisterView, rangeDates } from "./register-view";

export const SORT_COLUMNS = [
  "date",
  "account",
  "payee",
  "category",
  "memo",
  "amount",
  "cleared",
] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

/**
 * The register's search (YNAB's search syntax, see `parseSearch`) and sort, kept in the page
 * address so they survive a reload. The View menu's options are per register instead (see
 * `useRegisterView`). Bad values are dropped rather than failing the page.
 */
export const registerSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  sort: z.enum(SORT_COLUMNS).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
});

export type RegisterSearch = z.infer<typeof registerSearchSchema>;

/** The search text without its trailing comma, as YNAB quotes it. */
export function searchText(search: RegisterSearch) {
  return (search.q ?? "").trim().replace(/,\s*$/, "").trim();
}

/**
 * The API query for a register. YNAB's default order is newest first by date (a day's largest
 * outflow on top).
 */
export function registerQuery(
  accountId: string | undefined,
  search: RegisterSearch,
  view: RegisterView,
) {
  const q = searchText(search);
  return {
    ...(accountId ? { accountId } : {}),
    ...(q ? { q } : {}),
    ...rangeDates(view),
    ...(view.showReconciled ? {} : { hideReconciled: "true" as const }),
    sort: search.sort ?? "date",
    dir: search.dir ?? "desc",
  };
}

/** Clicking a header: a new column starts in its natural direction, the same one flips. */
export function nextSort(
  search: RegisterSearch,
  column: SortColumn,
  natural: "asc" | "desc" = column === "date" ? "desc" : "asc",
): Pick<RegisterSearch, "sort" | "dir"> {
  const sort = search.sort ?? "date";
  const dir = search.dir ?? "desc";
  if (sort === column) {
    const flipped = dir === "asc" ? "desc" : "asc";
    // Back to the default leaves the address clean.
    return column === "date" && flipped === "desc"
      ? { sort: undefined, dir: undefined }
      : { sort: column, dir: flipped };
  }
  return { sort: column, dir: natural };
}
