import { budgetAccount } from "@everycent/db/schema";
import type { RouteHandler } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { loadBudgetAccess } from "../../lib/budget-access";
import { assertNotFuture, latestTransactionDate } from "../../lib/dates";
import { importCutoff, importTransactions as importRows } from "../../lib/file-import";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import { assertOpen, findAccount } from "../transactions/rules";
import type { getImportContext, importTransactions } from "./routes";

type Env = AppEnv & AuthedEnv;

export const getImportContextHandler: RouteHandler<typeof getImportContext, Env> = async (c) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId);
  const account = await findAccount(db, budgetId, accountId);
  const cutoff = await importCutoff(db, account.id);
  return c.json(
    {
      ...cutoff,
      csvSettings: account.csvImportSettings ?? null,
      statementSettings: account.statementImportSettings ?? null,
    },
    200,
  );
};

export const importTransactionsHandler: RouteHandler<typeof importTransactions, Env> = async (
  c,
) => {
  const { budgetId, accountId } = c.req.valid("param");
  const { today } = c.req.valid("query");
  const body = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["create"] });
  const latest = latestTransactionDate(c.var.deps, today);
  for (const row of body.transactions) assertNotFuture(row.date, latest);
  const result = await db.transaction(async (tx) => {
    const account = await findAccount(tx, budgetId, accountId);
    assertOpen(account);
    if (body.csvSettings !== undefined || body.statementSettings !== undefined) {
      await tx
        .update(budgetAccount)
        .set({
          ...(body.csvSettings !== undefined ? { csvImportSettings: body.csvSettings } : {}),
          ...(body.statementSettings !== undefined
            ? { statementImportSettings: body.statementSettings }
            : {}),
        })
        .where(eq(budgetAccount.id, account.id));
    }
    return importRows(
      tx,
      c.var.deps,
      budgetId,
      account,
      body.transactions.map((row) => ({ ...row, amount: BigInt(row.amount) })),
    );
  });
  return c.json(
    {
      imported: result.transactionIds.length,
      duplicates: result.duplicates,
      transactionIds: result.transactionIds,
    },
    200,
  );
};
