import { newId, sql } from "@everycent/db";
import {
  category,
  categoryAssignment,
  categoryGroup,
  categoryTarget,
  subTransaction,
  transaction,
} from "@everycent/db/schema";
import { monthOf } from "@everycent/engine";
import { and, asc, eq, inArray, isNull, max } from "drizzle-orm";
import { adjustAssigned } from "../../lib/assignments";
import { AppError } from "../../lib/errors";
import { type Db, internalCategoryId } from "../../lib/ledger";

export type CategoryRow = typeof category.$inferSelect;
export type CategoryGroupRow = typeof categoryGroup.$inferSelect;
export type TargetRow = typeof categoryTarget.$inferSelect;

export function toTargetJson(t: TargetRow) {
  return {
    cadence: t.cadence,
    behavior: t.behavior,
    amount: t.amount.toString(),
    dueDay: t.dueDay,
    dueDate: t.dueDate,
    repeatEvery: t.repeatEvery,
    repeatUnit: t.repeatUnit,
    startMonth: monthOf(t.startMonth),
    snoozedMonth: t.snoozedMonth && monthOf(t.snoozedMonth),
  };
}

export function toCategoryJson(
  c: CategoryRow,
  hasTransactions = false,
  target: TargetRow | null = null,
) {
  return {
    id: c.id,
    groupId: c.groupId,
    name: c.name,
    note: c.note,
    hidden: c.hidden,
    linkedAccountId: c.linkedAccountId,
    hasTransactions,
    target: target && toTargetJson(target),
  };
}

export function toGroupJson(
  g: CategoryGroupRow,
  categories: CategoryRow[],
  used: ReadonlySet<string> = new Set(),
  targets: ReadonlyMap<string, TargetRow> = new Map(),
) {
  return {
    id: g.id,
    name: g.name,
    hidden: g.hidden,
    kind: g.kind,
    categories: categories.map((c) => toCategoryJson(c, used.has(c.id), targets.get(c.id))),
  };
}

/** Visible-to-users groups and categories (internal ones excluded), in display order. */
export async function listCategoryTree(db: Db, budgetId: string) {
  const groups = await db
    .select()
    .from(categoryGroup)
    .where(and(eq(categoryGroup.budgetId, budgetId), eq(categoryGroup.internal, false)))
    // YNAB pins Credit Card Payments to the top.
    .orderBy(
      sql`${categoryGroup.kind} is null`,
      asc(categoryGroup.sortOrder),
      asc(categoryGroup.id),
    );
  const categories = await db
    .select()
    .from(category)
    .where(and(eq(category.budgetId, budgetId), isNull(category.internalKind)))
    .orderBy(asc(category.sortOrder), asc(category.id));
  const usedRows = await db
    .selectDistinct({ id: transaction.categoryId })
    .from(transaction)
    .where(eq(transaction.budgetId, budgetId));
  const usedLines = await db
    .selectDistinct({ id: subTransaction.categoryId })
    .from(subTransaction)
    .innerJoin(transaction, eq(transaction.id, subTransaction.transactionId))
    .where(eq(transaction.budgetId, budgetId));
  const used = new Set([...usedRows, ...usedLines].flatMap((u) => (u.id ? [u.id] : [])));
  const targetRows = await db
    .select()
    .from(categoryTarget)
    .where(eq(categoryTarget.budgetId, budgetId));
  const targets = new Map(targetRows.map((t) => [t.categoryId, t]));
  return {
    readyToAssignCategoryId: await internalCategoryId(db, budgetId, "ready_to_assign"),
    groups: groups.map((g) =>
      toGroupJson(
        g,
        categories.filter((c) => c.groupId === g.id),
        used,
        targets,
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

/** Refuses edits YNAB doesn't allow on the Credit Card Payments group and payment categories. */
/** A category's target, if it has one. */
export async function findTarget(db: Db, categoryId: string) {
  const [row] = await db
    .select()
    .from(categoryTarget)
    .where(eq(categoryTarget.categoryId, categoryId));
  return row ?? null;
}

export function managedError(message: string) {
  return new AppError(409, "MANAGED_CATEGORY", message);
}

/** Whether any transaction uses one of these categories. */
export async function hasHistory(db: Db, categoryIds: readonly string[]) {
  if (categoryIds.length === 0) return false;
  const [row] = await db
    .select({ id: transaction.id })
    .from(transaction)
    .where(inArray(transaction.categoryId, [...categoryIds]))
    .limit(1);
  const [line] = await db
    .select({ id: subTransaction.id })
    .from(subTransaction)
    .where(inArray(subTransaction.categoryId, [...categoryIds]))
    .limit(1);
  return Boolean(row ?? line);
}

/**
 * Moves the history of categories that are about to be deleted to `targetId`, which must be
 * another category of the budget (Ready to Assign and Uncategorized included, payment categories
 * not). Without a target, deleting a category with history is refused.
 */
export async function reassignHistory(
  db: Db,
  budgetId: string,
  categoryIds: readonly string[],
  targetId: string | undefined,
) {
  if (!targetId && !(await hasHistory(db, categoryIds))) return;
  if (!targetId) {
    throw new AppError(
      409,
      "CATEGORY_HAS_HISTORY",
      "This category has transactions. Choose a category to move them to.",
    );
  }
  const [target] = await db
    .select()
    .from(category)
    .where(and(eq(category.id, targetId), eq(category.budgetId, budgetId)));
  if (!target) throw new AppError(404, "NOT_FOUND", "The category to move history to wasn't found");
  if (categoryIds.includes(target.id) || target.linkedAccountId) {
    throw new AppError(400, "BAD_REQUEST", "History can't be moved to that category");
  }
  // As in YNAB, the assigned money goes along (and with it what's available). Moved to Ready to
  // Assign or Uncategorized, it just returns to Ready to Assign with the deleted rows.
  const assignments = target.internalKind
    ? []
    : await db
        .select()
        .from(categoryAssignment)
        .where(inArray(categoryAssignment.categoryId, [...categoryIds]));
  for (const a of assignments) {
    await adjustAssigned(
      db,
      { id: budgetId, currency: a.currency },
      target.id,
      monthOf(a.month),
      a.amount,
    );
  }
  await db
    .update(transaction)
    .set({ categoryId: target.id })
    .where(inArray(transaction.categoryId, [...categoryIds]));
  await db
    .update(subTransaction)
    .set({ categoryId: target.id })
    .where(inArray(subTransaction.categoryId, [...categoryIds]));
}
