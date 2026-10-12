import {
  type CurrencyCode,
  TARGET_BEHAVIORS,
  TARGET_CADENCES,
  TARGET_REPEAT_UNITS,
} from "@everycent/engine";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { budgetAccount } from "./account";
import { user } from "./auth";
import { budget } from "./budget";
import { timestamps } from "./columns";

/**
 * System categories YNAB keeps out of the category list. Each budget has exactly one of each,
 * inside the budget's internal group.
 */
export const INTERNAL_CATEGORY_KINDS = ["ready_to_assign", "uncategorized"] as const;
export type InternalCategoryKind = (typeof INTERNAL_CATEGORY_KINDS)[number];

/** Groups YNAB manages itself. */
export const CATEGORY_GROUP_KINDS = ["credit_card_payments"] as const;
export type CategoryGroupKind = (typeof CATEGORY_GROUP_KINDS)[number];

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
    /** "credit_card_payments": listed first; can't be renamed, moved, hidden or deleted. */
    kind: text({ enum: CATEGORY_GROUP_KINDS }),
    ...timestamps,
  },
  (t) => [
    index("category_group_budget_id_idx").on(t.budgetId),
    uniqueIndex("category_group_one_internal_per_budget_idx")
      .on(t.budgetId)
      .where(sql`${t.internal}`),
    uniqueIndex("category_group_kind_per_budget_idx")
      .on(t.budgetId, t.kind)
      .where(sql`${t.kind} is not null`),
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
    /** Set on a credit account's payment category; named after the account. */
    linkedAccountId: text()
      .unique()
      .references(() => budgetAccount.id, { onDelete: "cascade" }),
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

/**
 * Money assigned to a category in one month (YNAB's "Assigned"). A row stays once a month has
 * been assigned in, even at zero: YNAB keeps such a month (and the one after it) open.
 */
export const categoryAssignment = pgTable(
  "category_assignment",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    categoryId: text()
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    /** First day of the month, YYYY-MM-01. */
    month: date({ mode: "string" }).notNull(),
    /** Minor units; negative when money was taken out. */
    amount: bigint({ mode: "bigint" }).notNull(),
    currency: char({ length: 3 }).$type<CurrencyCode>().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("category_assignment_category_month_idx").on(t.categoryId, t.month),
    index("category_assignment_budget_month_idx").on(t.budgetId, t.month),
  ],
);

/**
 * YNAB's "Recent Moves": every change to assigned money. From Ready to Assign (its internal
 * category) to a category is "Assigned", back to it "Removed", between two categories "Moved".
 */
export const moneyMove = pgTable(
  "money_move",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    /** Who moved the money; kept when they leave the budget. */
    userId: text().references(() => user.id, { onDelete: "set null" }),
    /** Null once the category is deleted; its name is kept in `fromCategoryName`. */
    fromCategoryId: text().references(() => category.id, { onDelete: "set null" }),
    toCategoryId: text().references(() => category.id, { onDelete: "set null" }),
    /**
     * The name of a deleted category on either side (YNAB keeps such moves as "deleted category
     * <name>"); null while the category exists.
     */
    fromCategoryName: text(),
    toCategoryName: text(),
    /** Logged by deleting a category (YNAB shows these with a trash icon, under "Moved"). */
    deletion: boolean().notNull().default(false),
    /** First day of the month the money moved in, YYYY-MM-01. */
    month: date({ mode: "string" }).notNull(),
    /** Minor units, always positive. */
    amount: bigint({ mode: "bigint" }).notNull(),
    currency: char({ length: 3 }).$type<CurrencyCode>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("money_move_budget_created_idx").on(t.budgetId, t.createdAt)],
);

/**
 * A category's target (YNAB's goal): one per category at a time. Editing it changes every month
 * from `startMonth` on; targets only compute what's asked for and never move money.
 */
export const categoryTarget = pgTable(
  "category_target",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    categoryId: text()
      .notNull()
      .unique()
      .references(() => category.id, { onDelete: "cascade" }),
    cadence: text({ enum: TARGET_CADENCES }).notNull(),
    behavior: text({ enum: TARGET_BEHAVIORS }).notNull(),
    /** Minor units: per week (weekly), per month (monthly) or per period (yearly, custom). */
    amount: bigint({ mode: "bigint" }).notNull(),
    currency: char({ length: 3 }).$type<CurrencyCode>().notNull(),
    /** Monthly: day of the month (1–31), null for the last day. Weekly: weekday, 0 = Sunday. */
    dueDay: integer(),
    /** Yearly and custom: the (first) due date; a balance target's month, or null for eventually. */
    dueDate: date({ mode: "string" }),
    /** Custom: repeats every N months (1–11) or years (1–2); null for a one-time target. */
    repeatEvery: integer(),
    repeatUnit: text({ enum: TARGET_REPEAT_UNITS }),
    /** First day of the first month the target applies to, YYYY-MM-01. */
    startMonth: date({ mode: "string" }).notNull(),
    /**
     * Weekly: the day of the start month it began on, when created (or made weekly) in the user's
     * current month; earlier occurrences that month aren't asked for. Null for the whole month.
     */
    startDay: integer(),
    /** YYYY-MM-01 of the month the target is snoozed for (YNAB's snooze lasts one month). */
    snoozedMonth: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [index("category_target_budget_id_idx").on(t.budgetId)],
);
