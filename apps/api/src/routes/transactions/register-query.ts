import { sql } from "@everycent/db";
import {
  budgetAccount,
  type ClearedState,
  category,
  type FlagColor,
  payee,
  subTransaction,
  transaction,
} from "@everycent/db/schema";
import { type CurrencyCode, type NumberFormat, parseAmount } from "@everycent/engine";
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AppError } from "../../lib/errors";
import type { Db } from "../../lib/ledger";

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

export interface RegisterFilter {
  accountId?: string;
  /** Matches payee, category, memo and account names, and amounts ("45.10"), split lines too. */
  q?: string;
  from?: string;
  to?: string;
  cleared?: ClearedState;
  /** A color, or "none" for unflagged. */
  flag?: FlagColor | "none";
  categoryId?: string;
  payeeId?: string;
}

export interface RegisterPage {
  sort: SortColumn;
  dir: "asc" | "desc";
  limit: number;
  cursor?: string;
}

/** What `q` is read with: amounts are typed in the budget's number format. */
export interface SearchSettings {
  currency: CurrencyCode;
  numberFormat: NumberFormat;
}

/**
 * Every transaction of the budget (or of one account) with its running balance. The window runs
 * over the whole account, oldest first, so filtering and paging happen outside it and every row
 * keeps the account's real balance at that point.
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
        memo: transaction.memo,
        cleared: transaction.cleared,
        flag: transaction.flag,
        transferAccountId: sql<string | null>`${payee.transferAccountId}`.as("transfer_account_id"),
        // A split line's transfer points at the split itself.
        transferTransactionId: sql<string | null>`coalesce(${transaction.transferTransactionId}, (
          select ${subTransaction.transactionId} from ${subTransaction}
          where ${subTransaction.id} = ${transaction.transferSubTransactionId}
        ))`.as("transfer_transaction_id"),
        transferFromSplit: sql<boolean>`${transaction.transferSubTransactionId} is not null`.as(
          "transfer_from_split",
        ),
        // As text, so the cursor keeps Postgres's microseconds.
        createdAt: sql<string>`${transaction.createdAt}::text`.as("created_at"),
        runningBalance: sql<string>`sum(${transaction.amount}) over (
          partition by ${transaction.accountId}
          order by ${transaction.date}, ${transaction.createdAt}, ${transaction.id}
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

/** The amount `q` reads as (unsigned minor units), if it's a number. */
function searchAmount(q: string, settings: SearchSettings): bigint | null {
  try {
    const { amount } = parseAmount(
      q.replace(/^[-+]/, ""),
      settings.currency,
      settings.numberFormat,
    );
    return amount < 0n ? -amount : amount;
  } catch {
    return null;
  }
}

/** A split line of the register row matches `condition` (over `st`, `sp`, `sc`). */
function lineMatches(r: Register, condition: SQL) {
  return sql`exists (
    select 1 from ${subTransaction} st
    left join ${payee} sp on sp.id = st.payee_id
    left join ${category} sc on sc.id = st.category_id
    where st.transaction_id = ${r.id} and (${condition})
  )`;
}

function filterWhere(r: Register, filter: RegisterFilter, settings: SearchSettings) {
  const conditions: (SQL | undefined)[] = [];
  const q = filter.q?.trim();
  if (q) {
    const pattern = likePattern(q);
    const amount = searchAmount(q, settings);
    conditions.push(sql`(
      ${r.payeeName} ilike ${pattern} or ${r.categoryName} ilike ${pattern}
      or ${r.memo} ilike ${pattern} or ${r.accountName} ilike ${pattern}
      ${amount === null ? sql`` : sql`or abs(${r.amount}) = ${amount}`}
      or ${lineMatches(
        r,
        sql`sp.name ilike ${pattern} or sc.name ilike ${pattern} or st.memo ilike ${pattern}
          ${amount === null ? sql`` : sql`or abs(st.amount) = ${amount}`}`,
      )}
    )`);
  }
  if (filter.from) conditions.push(sql`${r.date} >= ${filter.from}`);
  if (filter.to) conditions.push(sql`${r.date} <= ${filter.to}`);
  if (filter.cleared) conditions.push(sql`${r.cleared} = ${filter.cleared}`);
  if (filter.flag === "none") conditions.push(sql`${r.flag} is null`);
  else if (filter.flag) conditions.push(sql`${r.flag} = ${filter.flag}`);
  if (filter.categoryId) {
    conditions.push(
      sql`(${r.categoryId} = ${filter.categoryId} or ${lineMatches(r, sql`st.category_id = ${filter.categoryId}`)})`,
    );
  }
  if (filter.payeeId) {
    conditions.push(
      sql`(${r.payeeId} = ${filter.payeeId} or ${lineMatches(r, sql`st.payee_id = ${filter.payeeId}`)})`,
    );
  }
  return and(...conditions);
}

/** The sort column as SQL, plus the type its cursor value is cast back to. */
function sortKey(r: Register, sort: SortColumn): { key: SQL; cast: SQL } {
  const text = sql.raw("text");
  switch (sort) {
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
    case "amount":
      return { key: sql`${r.amount}`, cast: sql.raw("bigint") };
    case "cleared":
      return {
        key: sql`(case ${r.cleared} when 'uncleared' then 0 when 'cleared' then 1 else 2 end)`,
        cast: sql.raw("int"),
      };
  }
}

type Cursor = [sort: SortColumn, key: string, date: string, createdAt: string, id: string];

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(text: string, sort: SortColumn): Cursor {
  try {
    const value: unknown = JSON.parse(Buffer.from(text, "base64url").toString());
    if (
      Array.isArray(value) &&
      value.length === 5 &&
      value.every((v) => typeof v === "string") &&
      value[0] === sort
    ) {
      return value as Cursor;
    }
  } catch {
    // Falls through to the error below.
  }
  throw new AppError(400, "INVALID_CURSOR", "The cursor doesn't belong to this register or sort");
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
  const byTransaction = new Map<string, Omit<(typeof rows)[number], "transactionId">[]>();
  for (const { transactionId, ...line } of rows) {
    byTransaction.set(transactionId, [...(byTransaction.get(transactionId) ?? []), line]);
  }
  return byTransaction;
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
    transferAccountId: r.transferAccountId,
    transferTransactionId: r.transferTransactionId,
    transferFromSplit: r.transferFromSplit,
    createdAt: r.createdAt,
    runningBalance: r.runningBalance,
  };
}

type Row = Awaited<ReturnType<typeof selectPage>>[number];

function selectPage(db: Db, r: Register) {
  return db.with(r).select(columns(r)).from(r);
}

async function toJson(db: Db, rows: readonly Row[]) {
  const lines = await queryLines(
    db,
    rows.map((row) => row.id),
  );
  return rows.map(({ createdAt: _, ...row }) => ({
    ...row,
    amount: row.amount.toString(),
    subtransactions: (lines.get(row.id) ?? []).map((l) => ({ ...l, amount: l.amount.toString() })),
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
  const { key, cast } = sortKey(r, page.sort);
  const dir = page.dir === "asc" ? sql.raw("asc") : sql.raw("desc");
  // Ties break by date, then creation, then id, all in the sort's direction, so the order is
  // total and keyset paging never skips or repeats a row.
  let after: SQL | undefined;
  if (page.cursor) {
    const [, k, d, c, id] = decodeCursor(page.cursor, page.sort);
    const op = page.dir === "asc" ? sql.raw(">") : sql.raw("<");
    after = sql`(${key}, ${r.date}, ${r.createdAt}::timestamptz, ${r.id}) ${op}
      (${k}::${cast}, ${d}::date, ${c}::timestamptz, ${id})`;
  }
  return db
    .with(r)
    .select({ ...columns(r), sortKey: sql<string>`(${key})::text` })
    .from(r)
    .where(and(filterWhere(r, filter, settings), after))
    .orderBy(
      sql`${key} ${dir}`,
      sql`${r.date} ${dir}`,
      sql`${r.createdAt}::timestamptz ${dir}`,
      sql`${r.id} ${dir}`,
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
  return {
    transactions: await toJson(db, pageRows),
    nextCursor:
      more && last
        ? encodeCursor([page.sort, last.sortKey, last.date, last.createdAt, last.id])
        : null,
  };
}

/** One transaction as the register shows it (with its running balance). */
export async function queryRegisterRow(db: Db, budgetId: string, accountId: string, id: string) {
  const r = registerCte(db, budgetId, accountId);
  const rows = await selectPage(db, r).where(eq(r.id, id));
  const [row] = await toJson(db, rows);
  return row;
}
