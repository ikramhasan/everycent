import { category, categoryGroup } from "@everycent/db/schema";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, asc, eq, isNull } from "drizzle-orm";
import { loadBudgetAccess } from "../../lib/budget-access";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import {
  findCategory,
  findGroup,
  insertCategory,
  insertGroup,
  listCategoryTree,
  reorder,
  toCategoryJson,
  toGroupJson,
  writeOrder,
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
  await loadBudgetAccess(c, budgetId, { category: ["delete"] });
  await findGroup(db, budgetId, groupId);
  // Its categories cascade. Once transactions exist (sub-project 03), categories with history
  // must be reassigned before they can be deleted.
  await db.delete(categoryGroup).where(eq(categoryGroup.id, groupId));
  return c.body(null, 204);
};

export const moveCategoryGroupHandler: RouteHandler<typeof moveCategoryGroup, Env> = async (c) => {
  const { budgetId, groupId } = c.req.valid("param");
  const { beforeGroupId } = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { category: ["update"] });
  await db.transaction(async (tx) => {
    await findGroup(tx, budgetId, groupId);
    const groups = await tx
      .select({ id: categoryGroup.id })
      .from(categoryGroup)
      .where(and(eq(categoryGroup.budgetId, budgetId), eq(categoryGroup.internal, false)))
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
  await findGroup(db, budgetId, groupId);
  const created = await insertCategory(db, budgetId, groupId, name);
  return c.json(toCategoryJson(created), 201);
};

export const updateCategoryHandler: RouteHandler<typeof updateCategory, Env> = async (c) => {
  const { budgetId, categoryId } = c.req.valid("param");
  const data = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { category: ["update"] });
  let row = await findCategory(db, budgetId, categoryId);
  if (Object.keys(data).length > 0) {
    const [updated] = await db
      .update(category)
      .set(data)
      .where(eq(category.id, categoryId))
      .returning();
    if (updated) row = updated;
  }
  return c.json(toCategoryJson(row), 200);
};

export const deleteCategoryHandler: RouteHandler<typeof deleteCategory, Env> = async (c) => {
  const { budgetId, categoryId } = c.req.valid("param");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { category: ["delete"] });
  await findCategory(db, budgetId, categoryId);
  // Once transactions exist (sub-project 03), history must be reassigned before deleting.
  await db.delete(category).where(eq(category.id, categoryId));
  return c.body(null, 204);
};

export const moveCategoryHandler: RouteHandler<typeof moveCategory, Env> = async (c) => {
  const { budgetId, categoryId } = c.req.valid("param");
  const { groupId, beforeCategoryId } = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { category: ["update"] });
  await db.transaction(async (tx) => {
    const moving = await findCategory(tx, budgetId, categoryId);
    await findGroup(tx, budgetId, groupId);
    const siblings = await tx
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.groupId, groupId), isNull(category.internalKind)))
      .orderBy(asc(category.sortOrder), asc(category.id))
      .for("update");
    const targetIds = siblings.map((s) => s.id);
    if (!targetIds.includes(categoryId)) targetIds.push(categoryId);
    await writeOrder(tx, category, reorder(targetIds, categoryId, beforeCategoryId), { groupId });

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
