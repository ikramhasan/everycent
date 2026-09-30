import { category, categoryGroup } from "@everycent/db/schema";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, asc, eq, isNull } from "drizzle-orm";
import { loadBudgetAccess } from "../../lib/budget-access";
import { reorder, writeOrder } from "../../lib/ordering";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import {
  findCategory,
  findGroup,
  hasHistory,
  insertCategory,
  insertGroup,
  listCategoryTree,
  managedError,
  reassignHistory,
  toCategoryJson,
  toGroupJson,
} from "./queries";
import type {
  createCategory,
  createCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
  listCategories,
  moveCategory,
  moveCategoryGroup,
  updateCategory,
  updateCategoryGroup,
} from "./routes";

type Env = AppEnv & AuthedEnv;

export const listCategoriesHandler: RouteHandler<typeof listCategories, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  await loadBudgetAccess(c, budgetId);
  return c.json(await listCategoryTree(c.var.deps.db, budgetId), 200);
};

export const createCategoryGroupHandler: RouteHandler<typeof createCategoryGroup, Env> = async (
  c,
) => {
  const { budgetId } = c.req.valid("param");
  const { name } = c.req.valid("json");
  await loadBudgetAccess(c, budgetId, { category: ["create"] });
  const group = await insertGroup(c.var.deps.db, budgetId, name);
  return c.json(toGroupJson(group, []), 201);
};

export const updateCategoryGroupHandler: RouteHandler<typeof updateCategoryGroup, Env> = async (
  c,
) => {
  const { budgetId, groupId } = c.req.valid("param");
  const data = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { category: ["update"] });
  let group = await findGroup(db, budgetId, groupId);
  if (group.kind) throw managedError("The Credit Card Payments group can't be renamed or hidden");
  if (Object.keys(data).length > 0) {
    const [updated] = await db
      .update(categoryGroup)
      .set(data)
      .where(eq(categoryGroup.id, groupId))
      .returning();
    if (updated) group = updated;
  }
  const categories = await db
    .select()
    .from(category)
    .where(eq(category.groupId, groupId))
    .orderBy(asc(category.sortOrder), asc(category.id));
  return c.json(toGroupJson(group, categories), 200);
};

export const deleteCategoryGroupHandler: RouteHandler<typeof deleteCategoryGroup, Env> = async (
  c,
) => {
  const { budgetId, groupId } = c.req.valid("param");
  const { db } = c.var.deps;
  const { reassignToCategoryId } = c.req.valid("query");
  await loadBudgetAccess(c, budgetId, { category: ["delete"] });
  const group = await findGroup(db, budgetId, groupId);
  if (group.kind) throw managedError("The Credit Card Payments group can't be deleted");
  await db.transaction(async (tx) => {
    const members = await tx
      .select({ id: category.id })
      .from(category)
      .where(eq(category.groupId, groupId));
    await reassignHistory(
      tx,
      budgetId,
      members.map((m) => m.id),
      reassignToCategoryId,
    );
    // Its categories cascade.
    await tx.delete(categoryGroup).where(eq(categoryGroup.id, groupId));
  });
  return c.body(null, 204);
};

export const moveCategoryGroupHandler: RouteHandler<typeof moveCategoryGroup, Env> = async (c) => {
  const { budgetId, groupId } = c.req.valid("param");
  const { beforeGroupId } = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { category: ["update"] });
  await db.transaction(async (tx) => {
    const group = await findGroup(tx, budgetId, groupId);
    if (group.kind) throw managedError("The Credit Card Payments group always comes first");
    // The pinned Credit Card Payments group isn't part of the movable order.
    const groups = await tx
      .select({ id: categoryGroup.id })
      .from(categoryGroup)
      .where(
        and(
          eq(categoryGroup.budgetId, budgetId),
          eq(categoryGroup.internal, false),
          isNull(categoryGroup.kind),
        ),
      )
      .orderBy(asc(categoryGroup.sortOrder), asc(categoryGroup.id))
      .for("update");
    const order = reorder(
      groups.map((g) => g.id),
      groupId,
      beforeGroupId,
    );
    await writeOrder(tx, categoryGroup, order);
  });
  return c.json(await listCategoryTree(db, budgetId), 200);
};

export const createCategoryHandler: RouteHandler<typeof createCategory, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const { groupId, name } = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { category: ["create"] });
  const group = await findGroup(db, budgetId, groupId);
  if (group.kind) {
    throw managedError(
      "Payment categories are created automatically when you add a credit account",
    );
  }
  const created = await insertCategory(db, budgetId, groupId, name);
  return c.json(toCategoryJson(created), 201);
};

export const updateCategoryHandler: RouteHandler<typeof updateCategory, Env> = async (c) => {
  const { budgetId, categoryId } = c.req.valid("param");
  const data = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { category: ["update"] });
  let row = await findCategory(db, budgetId, categoryId);
  if (row.linkedAccountId && data.name !== undefined && data.name !== row.name) {
    throw managedError(
      "A payment category is named after its account. Rename the account instead.",
    );
  }
  if (Object.keys(data).length > 0) {
    const [updated] = await db
      .update(category)
      .set(data)
      .where(eq(category.id, categoryId))
      .returning();
    if (updated) row = updated;
  }
  return c.json(toCategoryJson(row, await hasHistory(db, [row.id])), 200);
};

export const deleteCategoryHandler: RouteHandler<typeof deleteCategory, Env> = async (c) => {
  const { budgetId, categoryId } = c.req.valid("param");
  const { db } = c.var.deps;
  const { reassignToCategoryId } = c.req.valid("query");
  await loadBudgetAccess(c, budgetId, { category: ["delete"] });
  const row = await findCategory(db, budgetId, categoryId);
  if (row.linkedAccountId) {
    throw managedError("Payment categories can be hidden, but not deleted");
  }
  await db.transaction(async (tx) => {
    await reassignHistory(tx, budgetId, [categoryId], reassignToCategoryId);
    await tx.delete(category).where(eq(category.id, categoryId));
  });
  return c.body(null, 204);
};

export const moveCategoryHandler: RouteHandler<typeof moveCategory, Env> = async (c) => {
  const { budgetId, categoryId } = c.req.valid("param");
  const { groupId, beforeCategoryId } = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { category: ["update"] });
  await db.transaction(async (tx) => {
    const moving = await findCategory(tx, budgetId, categoryId);
    const target = await findGroup(tx, budgetId, groupId);
    if (Boolean(moving.linkedAccountId) !== (target.kind === "credit_card_payments")) {
      throw managedError("Payment categories stay in the Credit Card Payments group");
    }
    const siblings = await tx
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.groupId, groupId), isNull(category.internalKind)))
      .orderBy(asc(category.sortOrder), asc(category.id))
      .for("update");
    const targetIds = siblings.map((s) => s.id);
    if (!targetIds.includes(categoryId)) targetIds.push(categoryId);
    await tx.update(category).set({ groupId }).where(eq(category.id, categoryId));
    await writeOrder(tx, category, reorder(targetIds, categoryId, beforeCategoryId));

    if (moving.groupId !== groupId) {
      const left = await tx
        .select({ id: category.id })
        .from(category)
        .where(eq(category.groupId, moving.groupId))
        .orderBy(asc(category.sortOrder), asc(category.id));
      await writeOrder(
        tx,
        category,
        left.map((l) => l.id),
      );
    }
  });
  return c.json(await listCategoryTree(db, budgetId), 200);
};
