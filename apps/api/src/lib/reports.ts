import { sql } from "@everycent/db";
import {
  budgetAccount,
  category,
  categoryGroup,
  type FlagColor,
  payee,
  subTransaction,
  transaction,
} from "@everycent/db/schema";
import { ACCOUNT_TYPES, type CurrencyCode, isOnBudget } from "@everycent/engine";
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type Db, internalCategoryId, internalPayeeId } from "./ledger";

/**
 * What a report sums (YNAB's Reflect definitions, settled on the test plan 2026-10-17):
 * - `spending`: lines on budget accounts with a category other than Inflow: Ready to Assign, split
 *   lines one by one. Transfers between budget accounts carry no category and drop out; a transfer
 *   to a tracking account counts under its category (Uncategorized when it has none). It's the
 *   plan's category Activity, so a report total equals Activity for the same month and category.
 * - `income`: lines on budget accounts categorized to Ready to Assign, except starting balances
 *   (YNAB's Income v Expense income).
 */
export const REPORT_KINDS = ["spending", "income"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** What a report's sums can be grouped by. */
export const REPORT_GROUPINGS = ["month", "group", "category", "payee", "account", "flag"] as const;
export type ReportGrouping = (typeof REPORT_GROUPINGS)[number];

/**
 * Which lines a report reads. `null` in `payeeIds` or `flags` matches lines with no payee or no
 * flag. Unset lists don't filter.
 */
export interface ReportFilter {
  kind: ReportKind;
  /** First and last day, inclusive (ISO dates). */
  start: string;
  end: string;
  accountIds?: readonly string[];
  groupIds?: readonly string[];
  categoryIds?: readonly string[];
  payeeIds?: readonly (string | null)[];
  flags?: readonly (FlagColor | null)[];
}

export interface ReportSum {
  keys: Partial<Record<ReportGrouping, string | null>>;
  /** Sum of the negative lines (≤ 0), in the budget's currency. */
  outflow: bigint;
  /** Sum of the positive lines (≥ 0). */
  inflow: bigint;
  net: bigint;
  /** Number of lines (a split's lines count one by one). */
  count: number;
}

const ON_BUDGET_TYPES = ACCOUNT_TYPES.filter((t) => isOnBudget(t));

/** The columns a report line reads, for whole transactions or split lines. */
interface LineSource {
  categoryId: SQLWrapper;
  payeeId: SQL;
  amount: SQLWrapper;
}

const wholeSource: LineSource = {
  categoryId: transaction.categoryId,
  payeeId: sql`${transaction.payeeId}`,
  amount: transaction.baseAmount,
};
// A split line's payee is its own, or the split's when it has none.
const lineSource: LineSource = {
  categoryId: subTransaction.categoryId,
  payeeId: sql`coalesce(${subTransaction.payeeId}, ${transaction.payeeId})`,
  amount: subTransaction.baseAmount,
};

/** Matches `column` against a list where null stands for "none". */
function matchNullable(column: SQLWrapper, values: readonly (string | null)[]) {
  const ids = values.filter((v): v is string => v !== null);
  const parts = [
    ids.length ? inArray(column as SQL, ids) : undefined,
    values.includes(null) ? isNull(column as SQL) : undefined,
  ].filter((p) => p !== undefined);
  return parts.length ? or(...parts) : sql`false`;
}

/** The budget's internal ids a report's definitions use. */
interface ReportIds {
  readyToAssign: string;
  startingBalance: string;
}

async function reportIds(db: Db, budgetId: string): Promise<ReportIds> {
  return {
    readyToAssign: await internalCategoryId(db, budgetId, "ready_to_assign"),
    startingBalance: await internalPayeeId(db, budgetId, "starting_balance"),
  };
}

function whereFor(budgetId: string, ids: ReportIds, filter: ReportFilter, source: LineSource) {
  const kind =
    filter.kind === "spending"
      ? and(isNotNull(source.categoryId as SQL), ne(source.categoryId as SQL, ids.readyToAssign))
      : and(
          eq(source.categoryId as SQL, ids.readyToAssign),
          or(isNull(source.payeeId), ne(source.payeeId, ids.startingBalance)),
        );
  return and(
    eq(transaction.budgetId, budgetId),
    gte(transaction.date, filter.start),
    lte(transaction.date, filter.end),
    inArray(budgetAccount.type, ON_BUDGET_TYPES),
    kind,
    filter.accountIds && inArray(transaction.accountId, [...filter.accountIds, ""]),
    filter.groupIds && inArray(category.groupId, [...filter.groupIds, ""]),
    filter.categoryIds && inArray(source.categoryId as SQL, [...filter.categoryIds, ""]),
    filter.payeeIds && matchNullable(source.payeeId, filter.payeeIds),
    filter.flags && matchNullable(transaction.flag, filter.flags),
  );
}

function groupExpression(grouping: ReportGrouping, source: LineSource): SQL<string | null> {
  switch (grouping) {
    case "month":
      return sql<string>`to_char(${transaction.date}, 'YYYY-MM')`;
    case "group":
      return sql<string | null>`${category.groupId}`;
    case "category":
      return sql<string | null>`${source.categoryId}`;
    case "payee":
      return sql<string | null>`${source.payeeId}`;
    case "account":
      return sql<string>`${transaction.accountId}`;
    case "flag":
      return sql<string | null>`${transaction.flag}`;
  }
}

async function sumSource(
  db: Db,
  budgetId: string,
  ids: ReportIds,
  filter: ReportFilter,
  groupBy: readonly ReportGrouping[],
  split: boolean,
) {
  const source = split ? lineSource : wholeSource;
  const keys = Object.fromEntries(groupBy.map((g) => [g, groupExpression(g, source)]));
  const amount = source.amount;
  const select = {
    ...keys,
    outflow: sql<string>`coalesce(sum(${amount}) filter (where ${amount} < 0), 0)`,
    inflow: sql<string>`coalesce(sum(${amount}) filter (where ${amount} > 0), 0)`,
    net: sql<string>`coalesce(sum(${amount}), 0)`,
    count: sql<number>`count(*)::int`,
  };
  const where = whereFor(budgetId, ids, filter, source);
  const grouped = Object.values(keys);
  const query = split
    ? db
        .select(select)
        .from(subTransaction)
        .innerJoin(transaction, eq(transaction.id, subTransaction.transactionId))
        .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
        .leftJoin(category, eq(category.id, subTransaction.categoryId))
        .where(where)
        .$dynamic()
    : db
        .select(select)
        .from(transaction)
        .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
        .leftJoin(category, eq(category.id, transaction.categoryId))
        .where(where)
        .$dynamic();
  return grouped.length ? query.groupBy(...grouped) : query;
}

/**
 * The report's lines summed per combination of `groupBy` keys (one row with no keys when
 * `groupBy` is empty and anything matched).
 */
export async function reportSums(
  db: Db,
  budgetId: string,
  filter: ReportFilter,
  groupBy: readonly ReportGrouping[],
): Promise<ReportSum[]> {
  const ids = await reportIds(db, budgetId);
  const [whole, lines] = await Promise.all([
    sumSource(db, budgetId, ids, filter, groupBy, false),
    sumSource(db, budgetId, ids, filter, groupBy, true),
  ]);
  const sums = new Map<string, ReportSum>();
  for (const row of [...whole, ...lines] as Record<string, unknown>[]) {
    const keys = Object.fromEntries(groupBy.map((g) => [g, row[g] as string | null]));
    const id = JSON.stringify(groupBy.map((g) => keys[g]));
    const sum = sums.get(id) ?? { keys, outflow: 0n, inflow: 0n, net: 0n, count: 0 };
    sum.outflow += BigInt(row.outflow as string);
    sum.inflow += BigInt(row.inflow as string);
    sum.net += BigInt(row.net as string);
    sum.count += row.count as number;
    sums.set(id, sum);
  }
  return [...sums.values()].filter((s) => s.count > 0);
}

export interface ReportLine {
  /** The transaction's id, or the split line's. */
  id: string;
  transactionId: string;
  accountId: string;
  accountName: string;
  date: string;
  payeeId: string | null;
  payeeName: string | null;
  categoryId: string | null;
  groupName: string | null;
  categoryName: string | null;
  memo: string;
  flag: FlagColor | null;
  cleared: "uncleared" | "cleared" | "reconciled";
  /** In the budget's currency. */
  amount: bigint;
  /** In the account's currency. */
  nativeAmount: bigint;
  currency: CurrencyCode;
  createdAt: Date;
}

export const REPORT_LINE_ORDERS = ["newest", "largest_outflow"] as const;
export type ReportLineOrder = (typeof REPORT_LINE_ORDERS)[number];

/**
 * The lines behind a report's sums (its drill-down and its transactions export): newest first as
 * the register lists them, or largest outflow first.
 */
export async function reportLines(
  db: Db,
  budgetId: string,
  filter: ReportFilter,
  order: ReportLineOrder = "newest",
): Promise<ReportLine[]> {
  const ids = await reportIds(db, budgetId);
  const splitPayee = alias(payee, "split_payee");
  const common = {
    transactionId: transaction.id,
    accountId: transaction.accountId,
    accountName: budgetAccount.name,
    date: transaction.date,
    groupName: categoryGroup.name,
    categoryName: category.name,
    flag: transaction.flag,
    cleared: transaction.cleared,
    createdAt: transaction.createdAt,
  };
  const [whole, lines] = await Promise.all([
    db
      .select({
        ...common,
        id: transaction.id,
        payeeId: transaction.payeeId,
        payeeName: payee.name,
        categoryId: transaction.categoryId,
        memo: transaction.memo,
        amount: transaction.baseAmount,
        nativeAmount: transaction.amount,
        currency: transaction.currency,
      })
      .from(transaction)
      .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
      .leftJoin(category, eq(category.id, transaction.categoryId))
      .leftJoin(categoryGroup, eq(categoryGroup.id, category.groupId))
      .leftJoin(payee, eq(payee.id, transaction.payeeId))
      .where(whereFor(budgetId, ids, filter, wholeSource)),
    db
      .select({
        ...common,
        id: subTransaction.id,
        payeeId: sql<string | null>`coalesce(${subTransaction.payeeId}, ${transaction.payeeId})`,
        payeeName: sql<string | null>`coalesce(${payee.name}, ${splitPayee.name})`,
        categoryId: subTransaction.categoryId,
        memo: subTransaction.memo,
        amount: subTransaction.baseAmount,
        nativeAmount: subTransaction.amount,
        currency: subTransaction.currency,
      })
      .from(subTransaction)
      .innerJoin(transaction, eq(transaction.id, subTransaction.transactionId))
      .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
      .leftJoin(category, eq(category.id, subTransaction.categoryId))
      .leftJoin(categoryGroup, eq(categoryGroup.id, category.groupId))
      .leftJoin(payee, eq(payee.id, subTransaction.payeeId))
      .leftJoin(splitPayee, eq(splitPayee.id, transaction.payeeId))
      .where(whereFor(budgetId, ids, filter, lineSource)),
  ]);
  const newest = (a: ReportLine, b: ReportLine) =>
    b.date.localeCompare(a.date) ||
    b.createdAt.getTime() - a.createdAt.getTime() ||
    a.id.localeCompare(b.id);
  return [...whole, ...lines].sort((a, b) =>
    order === "largest_outflow"
      ? (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0) || newest(a, b)
      : newest(a, b),
  );
}
