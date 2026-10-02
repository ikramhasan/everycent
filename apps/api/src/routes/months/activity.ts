import { sql } from "@everycent/db";
import {
  budgetAccount,
  category,
  categoryGroup,
  payee,
  subTransaction,
  transaction,
} from "@everycent/db/schema";
import { monthBounds } from "@everycent/engine";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { loadBudgetAccess } from "../../lib/budget-access";
import { AppError } from "../../lib/errors";
import { type Db, internalCategoryId, serverToday } from "../../lib/ledger";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type { listMonthActivity } from "./routes";

type Env = AppEnv & AuthedEnv;

/**
 * The categories whose activity is asked for: one category, a group's categories that aren't
 * hidden (the ones its totals add up), or Uncategorized.
 */
async function categoryIds(
  db: Db,
  budgetId: string,
  query: { categoryId?: string; groupId?: string; uncategorized?: boolean },
): Promise<string[]> {
  const asked = [query.categoryId, query.groupId, query.uncategorized || undefined].filter(
    (v) => v !== undefined,
  );
  if (asked.length !== 1) {
    throw new AppError(400, "BAD_REQUEST", "Pass one of categoryId, groupId or uncategorized");
  }
  if (query.uncategorized) return [await internalCategoryId(db, budgetId, "uncategorized")];
  if (query.categoryId) {
    const [row] = await db
      .select({ id: category.id, internalKind: category.internalKind })
      .from(category)
      .where(and(eq(category.id, query.categoryId), eq(category.budgetId, budgetId)));
    if (!row || row.internalKind) throw new AppError(404, "NOT_FOUND", "Category not found");
    return [row.id];
  }
  const groupId = query.groupId ?? "";
  const [group] = await db
    .select({ id: categoryGroup.id, internal: categoryGroup.internal })
    .from(categoryGroup)
    .where(and(eq(categoryGroup.id, groupId), eq(categoryGroup.budgetId, budgetId)));
  if (!group || group.internal) throw new AppError(404, "NOT_FOUND", "Category group not found");
  const rows = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.groupId, groupId), eq(category.hidden, false)));
  return rows.map((r) => r.id);
}

/**
 * The transactions behind a month's Activity (YNAB's Activity popover): those dated in the month
 * up to the user's today, with a split's lines listed one by one.
 */
export const listMonthActivityHandler: RouteHandler<typeof listMonthActivity, Env> = async (c) => {
  const { budgetId, month } = c.req.valid("param");
  const { today = serverToday(), ...query } = c.req.valid("query");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId);

  const ids = await categoryIds(db, budgetId, query);
  const { start, end } = monthBounds(month);
  const cutoff = end < today ? end : today;
  // Nothing matches an empty list, but the queries still run so their row types stay inferred.
  const inIds = ids.length ? ids : [""];
  const dated = and(
    eq(transaction.budgetId, budgetId),
    gte(transaction.date, start),
    lte(transaction.date, cutoff),
  );

  const whole = await db
    .select({
      id: transaction.id,
      transactionId: transaction.id,
      accountId: transaction.accountId,
      accountName: budgetAccount.name,
      date: transaction.date,
      payeeName: payee.name,
      categoryId: transaction.categoryId,
      memo: transaction.memo,
      amount: transaction.amount,
      createdAt: transaction.createdAt,
    })
    .from(transaction)
    .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
    .leftJoin(payee, eq(payee.id, transaction.payeeId))
    .where(and(dated, isNotNull(transaction.categoryId), inArray(transaction.categoryId, inIds)));

  // A split line shows its own payee, or the split's when it has none.
  const splitPayee = alias(payee, "split_payee");
  const lines = await db
    .select({
      id: subTransaction.id,
      transactionId: transaction.id,
      accountId: transaction.accountId,
      accountName: budgetAccount.name,
      date: transaction.date,
      payeeName: sql<string | null>`coalesce(${payee.name}, ${splitPayee.name})`,
      categoryId: subTransaction.categoryId,
      memo: subTransaction.memo,
      amount: subTransaction.amount,
      createdAt: transaction.createdAt,
    })
    .from(subTransaction)
    .innerJoin(transaction, eq(transaction.id, subTransaction.transactionId))
    .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
    .leftJoin(payee, eq(payee.id, subTransaction.payeeId))
    .leftJoin(splitPayee, eq(splitPayee.id, transaction.payeeId))
    .where(
      and(dated, isNotNull(subTransaction.categoryId), inArray(subTransaction.categoryId, inIds)),
    );

  // Newest first, as the register lists them.
  const rows = [...whole, ...lines].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.createdAt.getTime() - a.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  return c.json(
    {
      transactions: rows.map((r) => ({
        id: r.id,
        transactionId: r.transactionId,
        accountId: r.accountId,
        accountName: r.accountName,
        date: r.date,
        payeeName: r.payeeName,
        categoryId: r.categoryId,
        memo: r.memo,
        amount: r.amount.toString(),
      })),
    },
    200,
  );
};
