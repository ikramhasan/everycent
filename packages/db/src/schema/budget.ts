import {
  CURRENCY_SYMBOL_POSITIONS,
  type CurrencyCode,
  DATE_FORMATS,
  NUMBER_FORMATS,
} from "@everycent/engine";
import { bigint, char, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { timestamps } from "./columns";

// Budgets are Better Auth organization-plugin tables, renamed via the plugin's `schema` option
// (organization → budget, member → budgetMember, invitation → budgetInvitation). Plugin field
// names must match exactly; `organizationId` is mapped to `budgetId`.

export const BUDGET_ROLES = ["owner", "editor"] as const;
export type BudgetRole = (typeof BUDGET_ROLES)[number];

export const budget = pgTable("budget", {
  id: text().primaryKey(),
  name: text().notNull(),
  /** Required and unique in the plugin; set to a random id and never shown. */
  slug: text().notNull().unique(),
  logo: text(),
  metadata: text(),
  /** Base currency. Immutable: stored amounts are minor units of this currency. */
  currency: char({ length: 3 }).$type<CurrencyCode>().notNull(),
  numberFormat: text({ enum: NUMBER_FORMATS }).notNull(),
  currencySymbolPosition: text({ enum: CURRENCY_SYMBOL_POSITIONS }).notNull(),
  dateFormat: text({ enum: DATE_FORMATS }).notNull(),
  /** Set when a fresh start replaced this budget. It stays fully usable, as in YNAB. */
  archivedAt: timestamp({ withTimezone: true }),
  /**
   * YNAB's "Expected Income" under Cost to Be Me: what the household expects to earn in a month,
   * entered once and kept from month to month. Null until entered; YNAB can't clear it again.
   */
  expectedIncome: bigint({ mode: "bigint" }),
  expectedIncomeCurrency: char({ length: 3 }).$type<CurrencyCode>(),
  ...timestamps,
});

export const budgetMember = pgTable(
  "budget_member",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text({ enum: BUDGET_ROLES }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("budget_member_budget_user_idx").on(t.budgetId, t.userId),
    index("budget_member_user_id_idx").on(t.userId),
  ],
);

/** Required by the plugin; unused until sharing lands (roadmap phase 16). */
export const budgetInvitation = pgTable(
  "budget_invitation",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: text(),
    status: text().notNull().default("pending"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    inviterId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("budget_invitation_budget_id_idx").on(t.budgetId),
    index("budget_invitation_email_idx").on(t.email),
  ],
);

/** Per-user settings that follow the user across devices. */
export const userPreference = pgTable("user_preference", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastBudgetId: text().references(() => budget.id, { onDelete: "set null" }),
  ...timestamps,
});
