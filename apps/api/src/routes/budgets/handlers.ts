import { newId, sql } from "@everycent/db";
import { budget, budgetMember, userPreference } from "@everycent/db/schema";
import type { RouteHandler } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { type BudgetAccess, loadBudgetAccess, rememberLastBudget } from "../../lib/budget-access";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type { createBudget, deleteBudget, getBudget, listBudgets, updateBudget } from "./routes";

type Env = AppEnv & AuthedEnv;

function toBudgetJson({ budget: b, role }: BudgetAccess) {
  return {
    id: b.id,
    name: b.name,
    currency: b.currency,
    numberFormat: b.numberFormat,
    currencySymbolPosition: b.currencySymbolPosition,
    dateFormat: b.dateFormat,
    role,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

export const listBudgetsHandler: RouteHandler<typeof listBudgets, Env> = async (c) => {
  const { db } = c.var.deps;
  const userId = c.var.user.id;
  const rows = await db
    .select({ budget, role: budgetMember.role })
    .from(budgetMember)
    .innerJoin(budget, eq(budget.id, budgetMember.budgetId))
    .where(eq(budgetMember.userId, userId))
    .orderBy(sql`lower(${budget.name})`, budget.id);
  const [pref] = await db
    .select({ lastBudgetId: userPreference.lastBudgetId })
    .from(userPreference)
    .where(eq(userPreference.userId, userId));
  const lastUsed = pref?.lastBudgetId;
  return c.json(
    {
      budgets: rows.map(toBudgetJson),
      lastUsedBudgetId: rows.some((r) => r.budget.id === lastUsed) ? (lastUsed ?? null) : null,
    },
    200,
  );
};

export const createBudgetHandler: RouteHandler<typeof createBudget, Env> = async (c) => {
  const { auth, db } = c.var.deps;
  const body = c.req.valid("json");
  const created = await auth.api.createOrganization({
    body: { ...body, slug: newId(), keepCurrentActiveOrganization: true },
    headers: c.req.raw.headers,
  });
  if (!created) throw new Error("Budget creation returned nothing");
  await rememberLastBudget(db, c.var.user.id, created.id);
  return c.json(toBudgetJson(await loadBudgetAccess(c, created.id)), 201);
};

export const getBudgetHandler: RouteHandler<typeof getBudget, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const access = await loadBudgetAccess(c, budgetId);
  await rememberLastBudget(c.var.deps.db, c.var.user.id, budgetId);
  return c.json(toBudgetJson(access), 200);
};

export const updateBudgetHandler: RouteHandler<typeof updateBudget, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const data = c.req.valid("json");
  await loadBudgetAccess(c, budgetId, { organization: ["update"] });
  if (Object.keys(data).length > 0) {
    await c.var.deps.auth.api.updateOrganization({
      body: { organizationId: budgetId, data },
      headers: c.req.raw.headers,
    });
  }
  return c.json(toBudgetJson(await loadBudgetAccess(c, budgetId)), 200);
};

export const deleteBudgetHandler: RouteHandler<typeof deleteBudget, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  await loadBudgetAccess(c, budgetId, { organization: ["delete"] });
  await c.var.deps.auth.api.deleteOrganization({
    body: { organizationId: budgetId },
    headers: c.req.raw.headers,
  });
  return c.body(null, 204);
};
