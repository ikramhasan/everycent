import { sql } from "@everycent/db";
import { category, subTransaction, transaction } from "@everycent/db/schema";
import {
  type PayeeCategorization,
  payeeAutoCategory,
  payeePrefillCategory,
  payeeRecentCategories,
} from "@everycent/engine";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "./ledger";

/** What a payee's transactions say about its category. */
export interface PayeeCategories {
  /** Manage Payees' "Current default category" (two of the last three, see `payeeAutoCategory`). */
  autoCategoryId: string | null;
  /** What a new transaction for the payee starts with, by its Categorization setting. */
  prefillCategoryId: string | null;
  /** Categories used with the payee, most recent first, each once (split lines included). */
  recentCategoryIds: string[];
}

export interface PayeeCategorySettings {
  id: string;
  categorization: PayeeCategorization;
  defaultCategoryId: string | null;
  carriedCategoryId: string | null;
}

interface Use {
  payeeId: string;
  categoryId: string;
  date: string;
  createdAt: Date;
  /** -1 for a whole transaction, else the split line's order. */
  line: number;
}

/**
 * Each payee's categories, from its transactions by date. Uncategorized doesn't count. The default
 * only reads whole transactions, as YNAB's "last 3 transactions" skips splits; the recent
 * categories ("Suggested" in the category list) read split lines too, as YNAB's do.
 */
export async function payeeCategories(
  db: Db,
  budgetId: string,
  payees: readonly PayeeCategorySettings[],
): Promise<Map<string, PayeeCategories>> {
  const result = new Map<string, PayeeCategories>();
  const ids = payees.map((p) => p.id);
  if (ids.length === 0) return result;
  const counts = sql`${category.internalKind} is distinct from 'uncategorized'`;
  const [whole, lines] = await Promise.all([
    db
      .select({
        payeeId: sql<string>`${transaction.payeeId}`,
        categoryId: sql<string>`${transaction.categoryId}`,
        date: transaction.date,
        createdAt: transaction.createdAt,
        id: transaction.id,
      })
      .from(transaction)
      .innerJoin(category, eq(category.id, transaction.categoryId))
      .where(and(eq(transaction.budgetId, budgetId), inArray(transaction.payeeId, ids), counts)),
    db
      .select({
        payeeId: sql<string>`coalesce(${subTransaction.payeeId}, ${transaction.payeeId})`,
        categoryId: sql<string>`${subTransaction.categoryId}`,
        date: transaction.date,
        createdAt: transaction.createdAt,
        id: transaction.id,
        sortOrder: subTransaction.sortOrder,
      })
      .from(subTransaction)
      .innerJoin(transaction, eq(transaction.id, subTransaction.transactionId))
      .innerJoin(category, eq(category.id, subTransaction.categoryId))
      .where(
        and(
          eq(transaction.budgetId, budgetId),
          or(
            inArray(subTransaction.payeeId, ids),
            and(isNull(subTransaction.payeeId), inArray(transaction.payeeId, ids)),
          ),
          counts,
        ),
      ),
  ]);
  const uses: (Use & { id: string })[] = [
    ...whole.map((r) => ({ ...r, line: -1 })),
    ...lines.map(({ sortOrder, ...r }) => ({ ...r, line: sortOrder })),
  ];
  uses.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id) ||
      a.line - b.line,
  );
  const byPayee = new Map<string, Use[]>();
  for (const use of uses) {
    const list = byPayee.get(use.payeeId);
    if (list) list.push(use);
    else byPayee.set(use.payeeId, [use]);
  }

  for (const p of payees) {
    const own = byPayee.get(p.id) ?? [];
    const autoCategoryId = payeeAutoCategory(
      own.filter((u) => u.line < 0).map((u) => u.categoryId),
      p.carriedCategoryId,
    );
    result.set(p.id, {
      autoCategoryId,
      prefillCategoryId: payeePrefillCategory({
        categorization: p.categorization,
        defaultCategoryId: p.defaultCategoryId,
        autoCategoryId,
      }),
      recentCategoryIds: payeeRecentCategories(own.map((u) => u.categoryId).reverse()),
    });
  }
  return result;
}
