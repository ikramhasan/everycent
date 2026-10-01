import { z } from "zod";
import { todayIso } from "./dates";

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

export const DATE_RANGES = ["all", "this_month", "last_3_months", "this_year", "custom"] as const;
export type DateRange = (typeof DATE_RANGES)[number];

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: "All dates",
  this_month: "This month",
  last_3_months: "Last 3 months",
  this_year: "Year to date",
  custom: "Custom",
};

const FLAG_FILTERS = ["red", "orange", "yellow", "green", "blue", "purple", "none"] as const;

/**
 * The register's search, filters and sort, kept in the page address so a filtered register can
 * be bookmarked and survives a reload. Bad values are dropped rather than failing the page.
 */
export const registerSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  range: z.enum(DATE_RANGES).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  cleared: z.enum(["uncleared", "cleared", "reconciled"]).optional().catch(undefined),
  flag: z.enum(FLAG_FILTERS).optional().catch(undefined),
  categoryId: z.string().optional().catch(undefined),
  payeeId: z.string().optional().catch(undefined),
  sort: z.enum(SORT_COLUMNS).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
});

export type RegisterSearch = z.infer<typeof registerSearchSchema>;

/** The `from`/`to` dates a range stands for, relative to `today` (YYYY-MM-DD). */
export function rangeDates(
  search: Pick<RegisterSearch, "range" | "from" | "to">,
  today = todayIso(),
): { from?: string; to?: string } {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const first = (year: number, month: number) => {
    // `month` may be ≤ 0; roll it back into earlier years.
    const total = year * 12 + (month - 1);
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    return `${yy}-${String(mm).padStart(2, "0")}-01`;
  };
  switch (search.range ?? "all") {
    case "all":
      return {};
    case "this_month":
      return { from: first(y, m) };
    case "last_3_months":
      return { from: first(y, m - 2) };
    case "this_year":
      return { from: `${y}-01-01` };
    case "custom":
      return { from: search.from, to: search.to };
  }
}

/** Whether anything narrows the register (the sort doesn't). */
export function isFiltered(search: RegisterSearch) {
  return Boolean(
    search.q?.trim() ||
      (search.range && search.range !== "all") ||
      search.cleared ||
      search.flag ||
      search.categoryId ||
      search.payeeId,
  );
}

/**
 * The API query for a register: YNAB's default is newest first by date. The running balance only
 * makes sense in date order, so the register hides it for other sorts.
 */
export function registerQuery(accountId: string | undefined, search: RegisterSearch) {
  const { from, to } = rangeDates(search);
  return {
    ...(accountId ? { accountId } : {}),
    ...(search.q?.trim() ? { q: search.q.trim() } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(search.cleared ? { cleared: search.cleared } : {}),
    ...(search.flag ? { flag: search.flag } : {}),
    ...(search.categoryId ? { categoryId: search.categoryId } : {}),
    ...(search.payeeId ? { payeeId: search.payeeId } : {}),
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
