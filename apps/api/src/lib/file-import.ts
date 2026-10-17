import { sql } from "@everycent/db";
import { accountImportId, payee, payeeRule, transaction } from "@everycent/db/schema";
import { type ImportRow, importIds, isOnBudget, matchPayeeRule } from "@everycent/engine";
import { and, asc, eq, inArray, max, min } from "drizzle-orm";
import { type AccountRow, resolveCategory, usesCategory } from "../routes/transactions/rules";
import { type FxDeps, syncBases } from "./base-amount";
import { type Db, findOrCreatePayee, insertTransaction, internalCategoryId } from "./ledger";
import { payeeCategories } from "./payee-categories";

/**
 * Where a file import's "dated before the account's start date or last reconciliation" line falls
 * (EVERYCENT-66): the account's oldest transaction, or the newest reconciled one if that's later.
 * Rows dated before it are skipped unless the import includes them.
 */
export async function importCutoff(db: Db, accountId: string) {
  const [row] = await db
    .select({
      start: min(transaction.date),
      reconciled: max(
        sql<string>`case when ${transaction.cleared} = 'reconciled' then ${transaction.date} end`,
      ),
    })
    .from(transaction)
    .where(eq(transaction.accountId, accountId));
  return { startDate: row?.start ?? null, reconciledThrough: row?.reconciled ?? null };
}

export interface ImportResult {
  /** The new transactions, in the file's order. */
  transactionIds: string[];
  /** Rows the account had already taken in (same import id), so skipped. */
  duplicates: number;
}

/**
 * Adds a bank file's rows to `account` as YNAB's File Import does (2026-10-17, EVERYCENT-66):
 * cleared and unapproved, with the memo kept. A row whose import id the account has seen before
 * (`account_import_id`, deleted transactions included) is skipped. The payee goes through the
 * plan's renaming rules (EVERYCENT-174), and the category is the payee's usual one; an inflow from
 * a payee without one goes to Ready to Assign in a cash account, as YNAB did with a new payee.
 */
export async function importTransactions(
  tx: Db,
  fx: FxDeps,
  budgetId: string,
  account: AccountRow,
  rows: readonly ImportRow[],
): Promise<ImportResult> {
  const ids = importIds(rows);
  const seen = new Set(
    ids.length === 0
      ? []
      : (
          await tx
            .select({ id: accountImportId.importId })
            .from(accountImportId)
            .where(
              and(
                eq(accountImportId.accountId, account.id),
                inArray(accountImportId.importId, ids),
              ),
            )
        ).map((r) => r.id),
  );
  const fresh = rows.flatMap((row, i) => {
    const importId = ids[i] as string;
    if (seen.has(importId)) return [];
    seen.add(importId);
    return [{ row, importId }];
  });
  if (fresh.length === 0) return { transactionIds: [], duplicates: rows.length };

  const rules = await tx
    .select({ payeeId: payeeRule.payeeId, operator: payeeRule.operator, text: payeeRule.text })
    .from(payeeRule)
    .where(eq(payeeRule.budgetId, budgetId))
    .orderBy(asc(payeeRule.createdAt), asc(payeeRule.id));
  const payeeIds: (string | null)[] = [];
  for (const { row } of fresh) {
    const name = row.payee.trim();
    const rule = name ? matchPayeeRule(rules, name) : undefined;
    payeeIds.push(rule ? rule.payeeId : name ? await findOrCreatePayee(tx, budgetId, name) : null);
  }

  const known = [...new Set(payeeIds.filter((id): id is string => id !== null))];
  const settings = known.length
    ? await tx
        .select({
          id: payee.id,
          categorization: payee.categorization,
          defaultCategoryId: payee.defaultCategoryId,
          carriedCategoryId: payee.carriedCategoryId,
        })
        .from(payee)
        .where(inArray(payee.id, known))
    : [];
  const categories = await payeeCategories(tx, budgetId, settings);
  const cash =
    isOnBudget(account.type) && !["credit_card", "line_of_credit"].includes(account.type);
  const readyToAssign = cash ? await internalCategoryId(tx, budgetId, "ready_to_assign") : null;

  const transactionIds: string[] = [];
  for (const [i, { row, importId }] of fresh.entries()) {
    const payeeId = payeeIds[i] ?? null;
    const usual = payeeId ? (categories.get(payeeId)?.prefillCategoryId ?? null) : null;
    const wanted = usual ?? (row.amount > 0n ? readyToAssign : null);
    const id = await insertTransaction(tx, {
      budgetId,
      accountId: account.id,
      date: row.date,
      amount: row.amount,
      currency: account.currency,
      fx,
      payeeId,
      categoryId: usesCategory(account, null)
        ? await resolveCategory(tx, budgetId, account, null, wanted)
        : null,
      memo: row.memo,
      cleared: "cleared",
      flag: null,
      approved: false,
      importId,
      importedPayee: row.payee,
    });
    await syncBases(tx, id);
    transactionIds.push(id);
  }
  await tx
    .insert(accountImportId)
    .values(fresh.map(({ importId }) => ({ accountId: account.id, importId })))
    .onConflictDoNothing();
  return { transactionIds, duplicates: rows.length - fresh.length };
}
