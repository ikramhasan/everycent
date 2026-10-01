import { sql } from "@everycent/db";
import { budgetAccount, category, payee, subTransaction, transaction } from "@everycent/db/schema";
import { usesCategory } from "@everycent/engine";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, eq, exists, inArray, notInArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { loadBudgetAccess } from "../../lib/budget-access";
import { AppError } from "../../lib/errors";
import type { Db } from "../../lib/ledger";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import { matchingTransactions, type RegisterFilter, type SearchSettings } from "./register-query";
import type { bulkUpdateTransactions, summarizeSelection } from "./routes";
import { findAccount } from "./rules";

type Env = AppEnv & AuthedEnv;

type Selection = { ids: string[] } | { filter: RegisterFilter; exclude: string[] };

/** The selected transactions' ids, as a condition on `transaction.id`. */
function selectedWhere(
  db: Db,
  budgetId: string,
  selection: Selection,
  settings: SearchSettings,
): SQL {
  if ("ids" in selection) {
    return and(eq(transaction.budgetId, budgetId), inArray(transaction.id, selection.ids)) as SQL;
  }
  const matching = matchingTransactions(db, budgetId, selection.filter, settings);
  return and(
    eq(transaction.budgetId, budgetId),
    inArray(transaction.id, db.select({ id: matching.id }).from(matching)),
    selection.exclude.length > 0 ? notInArray(transaction.id, selection.exclude) : undefined,
  ) as SQL;
}

async function checkFilterAccount(db: Db, budgetId: string, selection: Selection) {
  if ("filter" in selection && selection.filter.accountId) {
    await findAccount(db, budgetId, selection.filter.accountId);
  }
}

export const summarizeSelectionHandler: RouteHandler<typeof summarizeSelection, Env> = async (
  c,
) => {
  const { budgetId } = c.req.valid("param");
  const { selection } = c.req.valid("json");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId);
  await checkFilterAccount(db, budgetId, selection);
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${transaction.amount}), 0)::text`,
    })
    .from(transaction)
    .where(selectedWhere(db, budgetId, selection, budget));
  return c.json({ count: row?.count ?? 0, total: row?.total ?? "0" }, 200);
};

function notAllowed(message: string, details: Record<string, number>): never {
  throw new AppError(400, "BULK_NOT_ALLOWED", message, details);
}

export const bulkUpdateTransactionsHandler: RouteHandler<
  typeof bulkUpdateTransactions,
  Env
> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const { selection, action } = c.req.valid("json");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId, { transaction: ["update"] });
  await checkFilterAccount(db, budgetId, selection);

  const updated = await db.transaction(async (tx) => {
    // Lock the selection, and read what the checks below need, before changing anything.
    const transferAccount = alias(budgetAccount, "transfer_account");
    const rows = await tx
      .select({
        id: transaction.id,
        cleared: transaction.cleared,
        accountType: budgetAccount.type,
        transferAccountType: transferAccount.type,
        isSplit: exists(
          tx
            .select({ one: sql`1` })
            .from(subTransaction)
            .where(eq(subTransaction.transactionId, transaction.id)),
        ),
      })
      .from(transaction)
      .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
      .leftJoin(payee, eq(payee.id, transaction.payeeId))
      .leftJoin(transferAccount, eq(transferAccount.id, payee.transferAccountId))
      .where(selectedWhere(tx, budgetId, selection, budget))
      .for("update", { of: transaction });
    if (rows.length === 0) return 0;
    const ids = rows.map((r) => r.id);

    switch (action.type) {
      case "cleared": {
        const reconciled = rows.filter((r) => r.cleared === "reconciled").length;
        if (reconciled > 0) {
          notAllowed(
            `${reconciled} of the selected transactions ${reconciled === 1 ? "is" : "are"} ` +
              "reconciled. Unselect them to change the rest.",
            { reconciled },
          );
        }
        await tx.update(transaction).set({ cleared: action.cleared }).where(selectedIds(ids));
        break;
      }
      case "flag":
        await tx.update(transaction).set({ flag: action.flag }).where(selectedIds(ids));
        break;
      case "categorize": {
        const splits = rows.filter((r) => r.isSplit).length;
        const noCategory = rows.filter(
          (r) => !r.isSplit && !usesCategory(r.accountType, r.transferAccountType),
        ).length;
        if (splits > 0 || noCategory > 0) {
          const parts = [
            splits > 0 ? `${splits} split${splits === 1 ? "" : "s"}` : null,
            noCategory > 0
              ? `${noCategory} transaction${noCategory === 1 ? "" : "s"} without a category ` +
                "(transfers within the budget or tracking accounts)"
              : null,
          ].filter(Boolean);
          notAllowed(
            `The selection includes ${parts.join(" and ")}. Unselect them to categorize the rest.`,
            { splits, noCategory },
          );
        }
        const [target] = await tx
          .select({ linkedAccountId: category.linkedAccountId })
          .from(category)
          .where(and(eq(category.id, action.categoryId), eq(category.budgetId, budgetId)));
        if (!target) throw new AppError(400, "BAD_REQUEST", "No such category in this budget");
        if (target.linkedAccountId) {
          throw new AppError(
            400,
            "CATEGORY_NOT_ALLOWED",
            "Credit card payment categories can't be used on transactions",
          );
        }
        await tx.update(transaction).set({ categoryId: action.categoryId }).where(selectedIds(ids));
        break;
      }
    }
    return rows.length;
  });
  return c.json({ updated }, 200);
};

/** One array parameter rather than one per id, so big selections stay one statement. */
function selectedIds(ids: readonly string[]) {
  return sql`${transaction.id} = any(${sql.param(ids)}::text[])`;
}
