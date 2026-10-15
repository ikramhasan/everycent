import { sql } from "@everycent/db";
import { category, transaction } from "@everycent/db/schema";
import { and, count, eq, or, type SQL } from "drizzle-orm";
import type { Db } from "./ledger";

/**
 * YNAB's "This needs a category" (2026-10-16, EVERYCENT-65): a transaction left Uncategorized.
 * Transactions that take no category (transfers within the budget, tracking accounts, splits,
 * a card's Starting Balance) have none at all, so they never need one.
 */
export function needsCategorySql(categoryId: SQL | typeof transaction.categoryId): SQL {
  return sql`exists (
    select 1 from ${category} review_category
    where review_category.id = ${categoryId} and review_category.internal_kind = 'uncategorized'
  )`;
}

/**
 * How many transactions in each account are unapproved or need a category: YNAB's "N new
 * transactions to approve or categorize" and the dot by the account in the sidebar.
 */
export async function transactionsToReview(db: Db, budgetId: string) {
  const rows = await db
    .select({ accountId: transaction.accountId, count: count() })
    .from(transaction)
    .where(
      and(
        eq(transaction.budgetId, budgetId),
        or(eq(transaction.approved, false), needsCategorySql(transaction.categoryId)),
      ),
    )
    .groupBy(transaction.accountId);
  return new Map(rows.map((r) => [r.accountId, r.count]));
}
