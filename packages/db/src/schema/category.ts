import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { budget } from "./budget";
import { timestamps } from "./columns";

/**
 * System categories YNAB keeps out of the category list. Each budget has exactly one of each,
 * inside the budget's internal group.
 */
export const INTERNAL_CATEGORY_KINDS = ["ready_to_assign", "uncategorized"] as const;
export type InternalCategoryKind = (typeof INTERNAL_CATEGORY_KINDS)[number];

export const categoryGroup = pgTable(
  "category_group",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** Display order among the budget's groups (ascending; gaps allowed). */
    sortOrder: integer().notNull(),
    hidden: boolean().notNull().default(false),
    /** Holds the internal categories; never listed, renamed, moved or deleted. */
    internal: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("category_group_budget_id_idx").on(t.budgetId),
    uniqueIndex("category_group_one_internal_per_budget_idx")
      .on(t.budgetId)
      .where(sql`${t.internal}`),
  ],
);

export const category = pgTable(
  "category",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    groupId: text()
      .notNull()
      .references(() => categoryGroup.id, { onDelete: "cascade" }),
    name: text().notNull(),
    note: text().notNull().default(""),
    /** Display order within the group (ascending; gaps allowed). */
    sortOrder: integer().notNull(),
    hidden: boolean().notNull().default(false),
    internalKind: text({ enum: INTERNAL_CATEGORY_KINDS }),
    ...timestamps,
  },
  (t) => [
    index("category_budget_id_idx").on(t.budgetId),
    index("category_group_id_idx").on(t.groupId),
    uniqueIndex("category_internal_kind_per_budget_idx")
      .on(t.budgetId, t.internalKind)
      .where(sql`${t.internalKind} is not null`),
  ],
);
