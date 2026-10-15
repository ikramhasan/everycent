import { sql } from "@everycent/db";
import {
  budgetAccount,
  type ClearedState,
  category,
  type FlagColor,
  flagName,
  payee,
  subTransaction,
  transaction,
} from "@everycent/db/schema";
import {
  ACCOUNT_TYPES,
  isOnBudget,
  parseSearch,
  type SearchSettings,
  type SearchTerm,
} from "@everycent/engine";
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AppError } from "../../lib/errors";
import { type Db, serverToday } from "../../lib/ledger";

export type { SearchSettings };

const ON_BUDGET_TYPES = ACCOUNT_TYPES.filter(isOnBudget);

/** What a register can sort by: YNAB's sortable columns (Outflow and Inflow apart). */
export const SORT_COLUMNS = [
  "date",
  "account",
  "payee",
  "category",
  "memo",
  "outflow",
  "inflow",
  "flag",
  "cleared",
] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];
export type SortDir = "asc" | "desc";
export interface SortField {
  column: SortColumn;
  dir: SortDir;
}

/** `payee:desc,date:asc`: YNAB's stacked sort, first field first. */
export const SORT_PATTERN = new RegExp(
  `^(${SORT_COLUMNS.join("|")}):(asc|desc)(,(${SORT_COLUMNS.join("|")}):(asc|desc))*$`,
);

/** The fields of a `SORT_PATTERN` string, a column's first mention winning. */
export function parseSort(text: string): SortField[] {
  const fields: SortField[] = [];
  for (const part of text.split(",")) {
    const [column, dir] = part.split(":") as [SortColumn, SortDir];
    if (!fields.some((f) => f.column === column)) fields.push({ column, dir });
  }
  return fields;
}

function formatSort(fields: readonly SortField[]) {
  return fields.map((f) => `${f.column}:${f.dir}`).join(",");
}

export interface RegisterFilter {
  accountId?: string;
  /** YNAB's search syntax (see `parseSearch`); split lines are matched one by one. */
  q?: string;
  from?: string;
  to?: string;
  /** The View menu's "Show Reconciled Transactions" turned off. */
  hideReconciled?: boolean;
  /** The user's today: a year-less `Income:` means its year, and partial dates complete from it. */
  today?: string;
}

export interface RegisterPage {
  sort: readonly SortField[];
  limit: number;
  cursor?: string;
}

/**
 * Every transaction of the budget (or of one account) with its running balance. The window runs
 * over the whole account, oldest first, so filtering and paging happen outside it and every row
 * keeps the account's real balance at that point. Within a day it runs inflows first, then
 * outflows from smallest to largest: the reverse of the register's default order (YNAB puts the
 * largest outflow of a day on top and the largest inflow at the bottom).
 */
function registerCte(db: Db, budgetId: string, accountId?: string) {
  return db.$with("register").as(
    db
      .select({
        id: transaction.id,
        accountId: transaction.accountId,
        accountName: sql<string>`${budgetAccount.name}`.as("account_name"),
        date: transaction.date,
        amount: transaction.amount,
        currency: transaction.currency,
        payeeId: transaction.payeeId,
        payeeName: sql<string | null>`${payee.name}`.as("payee_name"),
        categoryId: transaction.categoryId,
        categoryName: sql<string | null>`${category.name}`.as("category_name"),
        // YNAB's `Income:` search: Ready to Assign, which in YNAB also holds every budget
        // account's Starting Balance (we leave card debt's uncategorized; Design notes).
        income: sql<boolean>`coalesce(${category.internalKind} = 'ready_to_assign', false) or (
          ${transaction.categoryId} is null and ${payee.internalKind} = 'starting_balance'
          and ${inArray(budgetAccount.type, ON_BUDGET_TYPES)}
        )`.as("income"),
        memo: transaction.memo,
        cleared: transaction.cleared,
        flag: transaction.flag,
        approved: transaction.approved,
        // YNAB's "This needs a category": left Uncategorized (see `needsCategorySql`).
        needsCategory: sql<boolean>`coalesce(${category.internalKind} = 'uncategorized', false)`.as(
          "needs_category",
        ),
        transferAccountId: sql<string | null>`${payee.transferAccountId}`.as("transfer_account_id"),
        // A split line's transfer points at the split itself.
        transferTransactionId: sql<string | null>`coalesce(${transaction.transferTransactionId}, (
          select ${subTransaction.transactionId} from ${subTransaction}
          where ${subTransaction.id} = ${transaction.transferSubTransactionId}
        ))`.as("transfer_transaction_id"),
        transferFromSplit: sql<boolean>`${transaction.transferSubTransactionId} is not null`.as(
          "transfer_from_split",
        ),
        transferReconciled: sql<boolean>`exists (
          select 1 from ${transaction} other_side
          where other_side.id = ${transaction.transferTransactionId}
            and other_side.cleared = 'reconciled'
        )`.as("transfer_reconciled"),
        // As text, so the cursor keeps Postgres's microseconds.
        createdAt: sql<string>`${transaction.createdAt}::text`.as("created_at"),
        runningBalance: sql<string>`sum(${transaction.amount}) over (
          partition by ${transaction.accountId}
          order by ${transaction.date}, ${transaction.amount} desc, ${transaction.createdAt},
            ${transaction.id}
        )`.as("running_balance"),
      })
      .from(transaction)
      .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
      .leftJoin(payee, eq(payee.id, transaction.payeeId))
      .leftJoin(category, eq(category.id, transaction.categoryId))
      .where(
        and(
          eq(transaction.budgetId, budgetId),
          accountId ? eq(transaction.accountId, accountId) : undefined,
        ),
      ),
  );
}

type Register = ReturnType<typeof registerCte>;

/** `%` and `_` are literal in a search, not wildcards. */
function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * What a search term is checked against: the transaction itself, or one line of a split. A line
 * has its own payee (or the split's, when it has none), category, memo and amount; the rest is
 * the split's.
 */
interface Unit {
  payee: SQL;
  category: SQL;
  memo: SQL;
  amount: SQL;
  isSplit: SQL;
  /** In Ready to Assign (YNAB's `Income:`). */
  income: SQL;
}

function termWhere(r: Register, unit: Unit, term: SearchTerm, budgetId: string): SQL {
  switch (term.kind) {
    case "text": {
      const pattern = likePattern(term.text);
      return sql`(${unit.payee} ilike ${pattern} or ${unit.category} ilike ${pattern}
        or ${unit.memo} ilike ${pattern} or ${r.accountName} ilike ${pattern}
        ${term.amount === null ? sql`` : sql`or abs(${unit.amount}) = ${term.amount}`})`;
    }
    case "payee":
      return sql`coalesce(${unit.payee} ilike ${likePattern(term.text)}, false)`;
    case "category":
      return sql`coalesce(${unit.category} ilike ${likePattern(term.text)}, false)`;
    case "memo":
      return sql`coalesce(${unit.memo} ilike ${likePattern(term.text)}, false)`;
    case "account":
      return sql`${r.accountName} ilike ${likePattern(term.text)}`;
    case "split":
      return unit.isSplit;
    case "flag": {
      const text = term.text.toLowerCase();
      if (text === "none") return sql`${r.flag} is null`;
      return sql`(${r.flag} = ${text} or ${r.flag} in (
        select ${flagName.color} from ${flagName}
        where ${flagName.budgetId} = ${budgetId} and lower(${flagName.name}) = ${text}
      ))`;
    }
    case "is":
      switch (term.state) {
        case "uncleared":
        case "cleared":
        case "reconciled":
          return sql`${r.cleared} = ${term.state}`;
        case "unreconciled":
          return sql`${r.cleared} <> 'reconciled'`;
        case "cleared_or_reconciled":
          return sql`${r.cleared} in ('cleared', 'reconciled')`;
        case "approved":
          return sql`${r.approved}`;
        case "unapproved":
          return sql`not ${r.approved}`;
        case "needs_category":
          return sql`${r.needsCategory}`;
        case "unapproved_or_needs_category":
          return sql`(not ${r.approved} or ${r.needsCategory})`;
      }
      break;
    case "amount": {
      const signed = term.direction === "outflow" ? sql`-(${unit.amount})` : unit.amount;
      const op = sql.raw(term.op === "eq" ? "=" : term.op === "gte" ? ">=" : "<=");
      return sql`(${signed} > 0 and ${signed} ${op} ${term.amount})`;
    }
    case "date": {
      const op = sql.raw(term.op === "on" ? "=" : term.op === "before" ? "<=" : ">=");
      return sql`${r.date} ${op} ${term.date}`;
    }
    case "income": {
      // `searchTerms` has filled in a missing year.
      const year = term.year ?? Number(serverToday().slice(0, 4));
      const from = `${String(year).padStart(4, "0")}-${String(term.month).padStart(2, "0")}-01`;
      return sql`(${unit.income} and ${r.date} >= ${from}::date
        and ${r.date} < ${from}::date + interval '1 month')`;
    }
  }
  throw new Error("unreachable");
}

function allTerms(r: Register, unit: Unit, terms: readonly SearchTerm[], budgetId: string) {
  return sql.join(
    terms.map((t) => sql`(${termWhere(r, unit, t, budgetId)})`),
    sql` and `,
  );
}

/** The transaction as a search unit. */
function parentUnit(r: Register): Unit {
  return {
    payee: sql`${r.payeeName}`,
    category: sql`${r.categoryName}`,
    memo: sql`${r.memo}`,
    amount: sql`${r.amount}`,
    isSplit: sql`exists (select 1 from ${subTransaction} where ${subTransaction.transactionId} = ${r.id})`,
    income: sql`${r.income}`,
  };
}

/** A split line (`st`, its payee `sp` and category `sc`) as a search unit. */
function lineUnit(r: Register): Unit {
  return {
    payee: sql`coalesce(sp.name, ${r.payeeName})`,
    category: sql`sc.name`,
    memo: sql`st.memo`,
    amount: sql`st.amount`,
    isSplit: sql`false`,
    income: sql`coalesce(sc.internal_kind = 'ready_to_assign', false)`,
  };
}

/** `condition` over a split line of the register row, joined as `st`, `sp` and `sc`. */
function lineMatches(r: Register, condition: SQL) {
  return sql`exists (
    select 1 from ${subTransaction} st
    left join ${payee} sp on sp.id = st.payee_id
    left join ${category} sc on sc.id = st.category_id
    where st.transaction_id = ${r.id} and (${condition})
  )`;
}

/**
 * The search's terms. A month without a year is the user's current year (YNAB, 2026-10-15), so
 * the register matches the scheduled section around New Year; partial dates are completed from
 * the user's today too.
 */
function searchTerms(filter: RegisterFilter, settings: SearchSettings): SearchTerm[] {
  if (!filter.q) return [];
  const today = filter.today ?? serverToday();
  const year = Number(today.slice(0, 4));
  return parseSearch(filter.q, settings, today).map((t) =>
    t.kind === "income" && t.year === null ? { ...t, year } : t,
  );
}

/**
 * A transaction shows when it, or one of its split lines, matches every search term (YNAB then
 * shows only the lines that match). Dates and reconciled rows are the View menu's.
 */
function filterWhere(
  r: Register,
  budgetId: string,
  filter: RegisterFilter,
  settings: SearchSettings,
) {
  const conditions: (SQL | undefined)[] = [];
  const terms = searchTerms(filter, settings);
  if (terms.length > 0) {
    conditions.push(sql`(
      (${allTerms(r, parentUnit(r), terms, budgetId)})
      or ${lineMatches(r, allTerms(r, lineUnit(r), terms, budgetId))}
    )`);
  }
  if (filter.from) conditions.push(sql`${r.date} >= ${filter.from}`);
  if (filter.to) conditions.push(sql`${r.date} <= ${filter.to}`);
  if (filter.hideReconciled) conditions.push(sql`${r.cleared} <> 'reconciled'`);
  return and(...conditions);
}

/**
 * The ids (with amount, account and the bits bulk edits check) of every transaction `filter`
 * matches, for "select all". Same filter as the register, without paging.
 */
export function matchingTransactions(
  db: Db,
  budgetId: string,
  filter: RegisterFilter,
  settings: SearchSettings,
) {
  const r = registerCte(db, budgetId, filter.accountId);
  return db
    .with(r)
    .select({ id: r.id })
    .from(r)
    .where(filterWhere(r, budgetId, filter, settings))
    .as("matching");
}

/** A sort column as SQL (never null), plus the type its cursor value is cast back to. */
function sortKey(r: Register, column: SortColumn): { key: SQL; cast: SQL } {
  const text = sql.raw("text");
  const int = sql.raw("int");
  const bigint = sql.raw("bigint");
  switch (column) {
    case "date":
      return { key: sql`${r.date}`, cast: sql.raw("date") };
    case "account":
      return { key: sql`lower(${r.accountName})`, cast: text };
    case "payee":
      return { key: sql`lower(coalesce(${r.payeeName}, ''))`, cast: text };
    case "category":
      return { key: sql`lower(coalesce(${r.categoryName}, ''))`, cast: text };
    case "memo":
      return { key: sql`lower(${r.memo})`, cast: text };
    // Each amount column on its own: the other side's rows count as zero (YNAB, 2026-10-15).
    case "outflow":
      return { key: sql`greatest(-${r.amount}, 0)`, cast: bigint };
    case "inflow":
      return { key: sql`greatest(${r.amount}, 0)`, cast: bigint };
    // YNAB's order, ascending: no flag, then the flag menu's colors.
    case "flag":
      return {
        key: sql`(case ${r.flag} when 'red' then 1 when 'orange' then 2 when 'yellow' then 3
          when 'green' then 4 when 'blue' then 5 when 'purple' then 6 else 0 end)`,
        cast: int,
      };
    // Ascending: reconciled, cleared, uncleared.
    case "cleared":
      return {
        key: sql`(case ${r.cleared} when 'reconciled' then 0 when 'cleared' then 1 else 2 end)`,
        cast: int,
      };
  }
}

/**
 * `[sort, ...one key per sort field, date, tie, createdAt, id]`: the last row's place. `tie` is
 * the amount negated (a day's largest outflow first).
 */
type Cursor = string[];

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(text: string, sort: readonly SortField[]): Cursor {
  try {
    const value: unknown = JSON.parse(Buffer.from(text, "base64url").toString());
    if (
      Array.isArray(value) &&
      value.length === sort.length + 5 &&
      value.every((v) => typeof v === "string") &&
      value[0] === formatSort(sort)
    ) {
      return value;
    }
  } catch {
    // Falls through to the error below.
  }
  throw new AppError(400, "INVALID_CURSOR", "The cursor doesn't belong to this register or sort");
}

/**
 * Rows after `cursor` in the order `keys` (each with its own direction), then the fixed tiebreak
 * `tail` (descending): the first key that differs decides.
 */
function afterCursor(
  keys: readonly { key: SQL; cast: SQL; dir: SortDir }[],
  tail: SQL,
  cursor: Cursor,
) {
  const values = cursor.slice(1);
  const [d, t, c, id] = values.slice(keys.length);
  const tailAfter = sql`${tail} < (${d}::date, ${t}::bigint, ${c}::timestamptz, ${id})`;
  const levels: SQL[] = [];
  const equal: SQL[] = [];
  keys.forEach(({ key, cast, dir }, i) => {
    const value = sql`${values[i]}::${cast}`;
    const op = sql.raw(dir === "asc" ? ">" : "<");
    levels.push(and(...equal, sql`${key} ${op} ${value}`) as SQL);
    equal.push(sql`${key} = ${value}`);
  });
  levels.push(and(...equal, tailAfter) as SQL);
  return sql`(${sql.join(levels, sql` or `)})`;
}

/** Lines of the given split transactions, grouped by transaction. */
async function queryLines(db: Db, transactionIds: readonly string[]) {
  const other = alias(transaction, "other_side");
  const rows = await db
    .select({
      id: subTransaction.id,
      transactionId: subTransaction.transactionId,
      amount: subTransaction.amount,
      payeeId: subTransaction.payeeId,
      payeeName: payee.name,
      categoryId: subTransaction.categoryId,
      categoryName: category.name,
      memo: subTransaction.memo,
      transferAccountId: payee.transferAccountId,
      transferTransactionId: other.id,
      transferReconciled: sql<boolean>`coalesce(${other.cleared} = 'reconciled', false)`,
      sideMemo: other.memo,
      sideCleared: other.cleared,
      sideFlag: other.flag,
      sideApproved: other.approved,
      sideCategoryId: other.categoryId,
    })
    .from(subTransaction)
    .leftJoin(payee, eq(payee.id, subTransaction.payeeId))
    .leftJoin(category, eq(category.id, subTransaction.categoryId))
    .leftJoin(other, eq(other.transferSubTransactionId, subTransaction.id))
    // An empty page still runs the query (with no match) so the line type stays inferred.
    .where(
      inArray(subTransaction.transactionId, transactionIds.length ? [...transactionIds] : [""]),
    )
    .orderBy(asc(subTransaction.sortOrder), asc(subTransaction.id));
  type Line = Omit<
    (typeof rows)[number],
    "transactionId" | "sideMemo" | "sideCleared" | "sideFlag" | "sideApproved" | "sideCategoryId"
  > & { transferSide: TransferSide | null };
  const byTransaction = new Map<string, Line[]>();
  for (const row of rows) {
    const { transactionId, sideMemo, sideCleared, sideFlag, sideApproved, sideCategoryId, ...l } =
      row;
    const line: Line = {
      ...l,
      transferSide:
        l.transferTransactionId && sideCleared !== null
          ? {
              memo: sideMemo ?? "",
              cleared: sideCleared,
              flag: sideFlag,
              approved: sideApproved ?? true,
              categoryId: sideCategoryId,
            }
          : null,
    };
    byTransaction.set(transactionId, [...(byTransaction.get(transactionId) ?? []), line]);
  }
  return byTransaction;
}

/** A transfer's other side's own state (what an undo needs to bring it back as it was). */
export interface TransferSide {
  memo: string;
  cleared: ClearedState;
  flag: FlagColor | null;
  approved: boolean;
  categoryId: string | null;
}

/** The other sides of these rows' transfers (not a split line's, which `queryLines` has). */
async function queryTransferSides(db: Db, rows: readonly Row[]) {
  const ids = rows.flatMap((r) =>
    r.transferTransactionId && !r.transferFromSplit ? [r.transferTransactionId] : [],
  );
  const sides = new Map<string, TransferSide>();
  if (ids.length === 0) return sides;
  const found = await db
    .select({
      id: transaction.id,
      memo: transaction.memo,
      cleared: transaction.cleared,
      flag: transaction.flag,
      approved: transaction.approved,
      categoryId: transaction.categoryId,
    })
    .from(transaction)
    .where(inArray(transaction.id, ids));
  for (const { id, ...side } of found) sides.set(id, side);
  return sides;
}

/** The register's columns, selected from the CTE. */
function columns(r: Register) {
  return {
    id: r.id,
    accountId: r.accountId,
    accountName: r.accountName,
    date: r.date,
    amount: r.amount,
    currency: r.currency,
    payeeId: r.payeeId,
    payeeName: r.payeeName,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    memo: r.memo,
    cleared: r.cleared,
    flag: r.flag,
    approved: r.approved,
    needsCategory: r.needsCategory,
    transferAccountId: r.transferAccountId,
    transferTransactionId: r.transferTransactionId,
    transferFromSplit: r.transferFromSplit,
    transferReconciled: r.transferReconciled,
    createdAt: r.createdAt,
    runningBalance: r.runningBalance,
  };
}

type Row = Awaited<ReturnType<typeof selectPage>>[number];

function selectPage(db: Db, r: Register) {
  return db.with(r).select(columns(r)).from(r);
}

/**
 * `matching`: under a search, the ids of the split lines that matched it, by transaction (YNAB
 * shows only those). Null when there's no search.
 */
async function toJson(
  db: Db,
  rows: readonly Row[],
  matching: ReadonlyMap<string, string[]> | null = null,
) {
  const lines = await queryLines(
    db,
    rows.map((row) => row.id),
  );
  const sides = await queryTransferSides(db, rows);
  return rows.map(({ createdAt: _, ...row }) => ({
    ...row,
    amount: row.amount.toString(),
    transferSide:
      row.transferTransactionId && !row.transferFromSplit
        ? (sides.get(row.transferTransactionId) ?? null)
        : null,
    subtransactions: (lines.get(row.id) ?? []).map((l) => ({ ...l, amount: l.amount.toString() })),
    matchingLineIds: matching ? (matching.get(row.id) ?? []) : null,
    // Postgres returns numeric sums as strings; BigInt normalizes them exactly.
    runningBalance: BigInt(row.runningBalance).toString(),
  }));
}

/** The query for one page (one row more than the limit, to know if there's another page). */
export function registerPageQuery(
  db: Db,
  budgetId: string,
  filter: RegisterFilter,
  page: RegisterPage,
  settings: SearchSettings,
) {
  const r = registerCte(db, budgetId, filter.accountId);
  const keys = page.sort.map((f) => ({ ...sortKey(r, f.column), dir: f.dir }));
  // After the sort's fields, ties break by date, then amount (newest first, a day's largest
  // outflow on top, as YNAB sorts by default), then creation, then id, so the order is total and
  // keyset paging never skips or repeats a row.
  const tie = sql`(-${r.amount})`;
  const tail = sql`(${r.date}, ${tie}, ${r.createdAt}::timestamptz, ${r.id})`;
  const after = page.cursor
    ? afterCursor(keys, tail, decodeCursor(page.cursor, page.sort))
    : undefined;
  return db
    .with(r)
    .select({
      ...columns(r),
      sortKeys: sql<string[]>`array[${sql.join(
        keys.map(({ key }) => sql`(${key})::text`),
        sql`, `,
      )}]::text[]`,
      tie: sql<string>`${tie}::text`,
    })
    .from(r)
    .where(and(filterWhere(r, budgetId, filter, settings), after))
    .orderBy(
      ...keys.map(({ key, dir }) => sql`${key} ${sql.raw(dir)}`),
      sql`${r.date} desc`,
      sql`${tie} desc`,
      sql`${r.createdAt}::timestamptz desc`,
      sql`${r.id} desc`,
    )
    .limit(page.limit + 1);
}

/** One page of a register, filtered and sorted, with the cursor for the next. */
export async function queryRegister(
  db: Db,
  budgetId: string,
  filter: RegisterFilter,
  page: RegisterPage,
  settings: SearchSettings,
) {
  const rows = await registerPageQuery(db, budgetId, filter, page, settings);
  const more = rows.length > page.limit;
  const pageRows = rows.slice(0, page.limit);
  const last = pageRows.at(-1);
  const terms = searchTerms(filter, settings);
  const matching =
    terms.length > 0
      ? await matchingLines(
          db,
          budgetId,
          filter.accountId,
          pageRows.map((row) => row.id),
          terms,
        )
      : null;
  return {
    transactions: await toJson(db, pageRows, matching),
    // Asked once, with the first page.
    someHidden: page.cursor ? null : await someHidden(db, budgetId, filter, settings),
    nextCursor:
      more && last
        ? encodeCursor([
            formatSort(page.sort),
            ...last.sortKeys,
            last.date,
            last.tie,
            last.createdAt,
            last.id,
          ])
        : null,
  };
}

/** Of these transactions' split lines, the ones that match every term, by transaction. */
async function matchingLines(
  db: Db,
  budgetId: string,
  accountId: string | undefined,
  ids: readonly string[],
  terms: readonly SearchTerm[],
) {
  const byTransaction = new Map<string, string[]>();
  if (ids.length === 0) return byTransaction;
  const r = registerCte(db, budgetId, accountId);
  const rows = await db
    .with(r)
    .select({ id: sql<string>`st.id`, transactionId: r.id })
    .from(r)
    .innerJoin(sql`${subTransaction} st`, sql`st.transaction_id = ${r.id}`)
    .leftJoin(sql`${payee} sp`, sql`sp.id = st.payee_id`)
    .leftJoin(sql`${category} sc`, sql`sc.id = st.category_id`)
    .where(and(inArray(r.id, [...ids]), allTerms(r, lineUnit(r), terms, budgetId)));
  for (const { id, transactionId } of rows) {
    byTransaction.set(transactionId, [...(byTransaction.get(transactionId) ?? []), id]);
  }
  return byTransaction;
}

/** Whether the search, date range or hidden reconciled rows leave any of the register out. */
async function someHidden(
  db: Db,
  budgetId: string,
  filter: RegisterFilter,
  settings: SearchSettings,
) {
  const r = registerCte(db, budgetId, filter.accountId);
  const where = filterWhere(r, budgetId, filter, settings);
  if (!where) return false;
  const [row] = await db
    .with(r)
    .select({ hidden: sql<boolean>`true` })
    .from(r)
    .where(sql`not coalesce((${where}), false)`)
    .limit(1);
  return Boolean(row);
}

/** Transactions as the register shows them (with each account's running balance). */
export async function queryRegisterRows(db: Db, budgetId: string, ids: readonly string[]) {
  if (ids.length === 0) return [];
  const r = registerCte(db, budgetId);
  return toJson(db, await selectPage(db, r).where(inArray(r.id, [...ids])));
}

/** One transaction as the register shows it (with its running balance). */
export async function queryRegisterRow(db: Db, budgetId: string, accountId: string, id: string) {
  const r = registerCte(db, budgetId, accountId);
  const rows = await selectPage(db, r).where(eq(r.id, id));
  const [row] = await toJson(db, rows);
  return row;
}
