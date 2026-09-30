import { type Database, newId } from "@everycent/db";
import { category, categoryGroup } from "@everycent/db/schema";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { AppError } from "../../lib/errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

export type CategoryRow = typeof category.$inferSelect;
export type CategoryGroupRow = typeof categoryGroup.$inferSelect;

export function toCategoryJson(c: CategoryRow) {
  return { id: c.id, groupId: c.groupId, name: c.name, note: c.note, hidden: c.hidden };
}

export function toGroupJson(g: CategoryGroupRow, categories: CategoryRow[]) {
  return { id: g.id, name: g.name, hidden: g.hidden, categories: categories.map(toCategoryJson) };
}

/** Visible-to-users groups and categories (internal ones excluded), in display order. */
export async function listCategoryTree(db: Db, budgetId: string) {
  const groups = await db
    .select()
    .from(categoryGroup)
    .where(and(eq(categoryGroup.budgetId, budgetId), eq(categoryGroup.internal, false)))
    .orderBy(asc(categoryGroup.sortOrder), asc(categoryGroup.id));
  const categories = await db
    .select()
    .from(category)
    .where(and(eq(category.budgetId, budgetId), isNull(category.internalKind)))
    .orderBy(asc(category.sortOrder), asc(category.id));
  return {
    groups: groups.map((g) =>
      toGroupJson(
        g,
        categories.filter((c) => c.groupId === g.id),
      ),
    ),
  };
}

/** A user-editable group of the budget. Internal groups are reported as not found. */
export async function findGroup(db: Db, budgetId: string, groupId: string) {
  const [row] = await db
    .select()
    .from(categoryGroup)
    .where(
      and(
        eq(categoryGroup.id, groupId),
        eq(categoryGroup.budgetId, budgetId),
        eq(categoryGroup.internal, false),
      ),
    );
  if (!row) throw new AppError(404, "NOT_FOUND", "Category group not found");
  return row;
}

/** A user-editable category of the budget. Internal categories are reported as not found. */
export async function findCategory(db: Db, budgetId: string, categoryId: string) {
  const [row] = await db
    .select()
    .from(category)
    .where(
      and(
        eq(category.id, categoryId),
        eq(category.budgetId, budgetId),
        isNull(category.internalKind),
      ),
    );
  if (!row) throw new AppError(404, "NOT_FOUND", "Category not found");
  return row;
}

async function nextSortOrder(
  db: Db,
  table: typeof category | typeof categoryGroup,
  where: ReturnType<typeof eq>,
) {
  const [row] = await db
    .select({ value: max(table.sortOrder) })
    .from(table)
    .where(where);
  return (row?.value ?? -1) + 1;
}

export async function insertGroup(db: Db, budgetId: string, name: string) {
  const sortOrder = await nextSortOrder(db, categoryGroup, eq(categoryGroup.budgetId, budgetId));
  const [row] = await db
    .insert(categoryGroup)
    .values({ id: newId(), budgetId, name, sortOrder })
    .returning();
  if (!row) throw new Error("Category group insert returned nothing");
  return row;
}

export async function insertCategory(db: Db, budgetId: string, groupId: string, name: string) {
  const sortOrder = await nextSortOrder(db, category, eq(category.groupId, groupId));
  const [row] = await db
    .insert(category)
    .values({ id: newId(), budgetId, groupId, name, sortOrder })
    .returning();
  if (!row) throw new Error("Category insert returned nothing");
  return row;
}

/**
 * Returns `ids` without `movingId`, with `movingId` inserted before `beforeId` (or at the end
 * when `beforeId` is null). `beforeId` must be one of `ids`.
 */
export function reorder(ids: readonly string[], movingId: string, beforeId: string | null) {
  const rest = ids.filter((id) => id !== movingId);
  if (beforeId === null || beforeId === movingId) {
    if (beforeId === movingId) return [...ids];
    return [...rest, movingId];
  }
  const at = rest.indexOf(beforeId);
  if (at === -1)
    throw new AppError(400, "BAD_REQUEST", "The position to move to isn't in that list");
  return [...rest.slice(0, at), movingId, ...rest.slice(at)];
}

/** Rewrites sort_order to match `ids` (0-based). Lists are short, so one update per row is fine. */
export async function writeOrder(
  tx: Tx,
  table: typeof category | typeof categoryGroup,
  ids: readonly string[],
  extra: Partial<{ groupId: string }> = {},
) {
  for (const [sortOrder, id] of ids.entries()) {
    await tx
      .update(table)
      .set({ sortOrder, ...extra })
      .where(eq(table.id, id));
  }
}
