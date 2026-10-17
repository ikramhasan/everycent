import { newId } from "@everycent/db";
import { budget } from "@everycent/db/schema";
import type { BudgetFormatSettings, CurrencyCode } from "@everycent/engine";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import { setAuditContext } from "../audit-context";
import { rememberLastBudget } from "../budget-access";
import type { Tx } from "../ledger";

/**
 * Creates a budget for an import (a backup, a YNAB plan) and fills it in one transaction: the
 * organization plugin makes the budget with its internal categories (and the caller as owner),
 * then `fill` adds everything else. If `fill` fails the half-made budget is deleted again.
 * Requests that call this run outside the request transaction (see `audit-context.ts`).
 */
export async function createFilledBudget<T>(
  // biome-ignore lint/suspicious/noExplicitAny: any route's context
  c: Context<AppEnv & AuthedEnv, any, any>,
  settings: { name: string; currency: CurrencyCode } & BudgetFormatSettings,
  fill: (tx: Tx, budgetId: string) => Promise<T>,
): Promise<{ budgetId: string; result: T }> {
  const { auth, db } = c.var.deps;
  const created = await auth.api.createOrganization({
    body: {
      name: settings.name,
      currency: settings.currency,
      numberFormat: settings.numberFormat,
      currencySymbolPosition: settings.currencySymbolPosition,
      dateFormat: settings.dateFormat,
      slug: newId(),
      keepCurrentActiveOrganization: true,
    },
    headers: c.req.raw.headers,
  });
  if (!created) throw new Error("Budget creation returned nothing");
  try {
    const result = await db.transaction(async (tx) => {
      await setAuditContext(tx, { actorId: c.var.user.id, requestId: c.var.requestId });
      return fill(tx, created.id);
    });
    await rememberLastBudget(db, c.var.user.id, created.id);
    return { budgetId: created.id, result };
  } catch (error) {
    await db.delete(budget).where(eq(budget.id, created.id));
    throw error;
  }
}
