import { ACCOUNT_TYPES, type CurrencyCode } from "@everycent/engine";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { budget } from "./budget";
import { category } from "./category";
import { timestamps } from "./columns";

// Named `account` in YNAB, but Better Auth owns the `account` table (logins), so the table is
// `budget_account`.
export const budgetAccount = pgTable(
  "budget_account",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    name: text().notNull(),
    type: text({ enum: ACCOUNT_TYPES }).notNull(),
    note: text().notNull().default(""),
    /** Display order in the sidebar (ascending; gaps allowed). */
    sortOrder: integer().notNull(),
    closed: boolean().notNull().default(false),
    /** Currency of every amount in this account. For now always the budget's (see deferred.md). */
    currency: char({ length: 3 }).$type<CurrencyCode>().notNull(),
    /** Loan accounts: annual interest rate in percent, e.g. "6.125". */
    interestRate: numeric({ precision: 6, scale: 3 }),
    /** Loan accounts: monthly minimum payment, in `currency` minor units. */
    minimumPayment: bigint({ mode: "bigint" }),
    /** Loan accounts: monthly escrow, in `currency` minor units. */
    escrowAmount: bigint({ mode: "bigint" }),
    ...timestamps,
  },
  (t) => [index("budget_account_budget_id_idx").on(t.budgetId)],
);

/** Payees YNAB creates itself and people can't rename or merge. */
export const INTERNAL_PAYEE_KINDS = ["starting_balance", "manual_balance_adjustment"] as const;
export type InternalPayeeKind = (typeof INTERNAL_PAYEE_KINDS)[number];

export const payee = pgTable(
  "payee",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    name: text().notNull(),
    internalKind: text({ enum: INTERNAL_PAYEE_KINDS }),
    ...timestamps,
  },
  (t) => [
    index("payee_budget_id_idx").on(t.budgetId),
    // YNAB treats "Costco" and "costco" as the same payee.
    uniqueIndex("payee_name_per_budget_idx").on(t.budgetId, sql`lower(${t.name})`),
    uniqueIndex("payee_internal_kind_per_budget_idx")
      .on(t.budgetId, t.internalKind)
      .where(sql`${t.internalKind} is not null`),
  ],
);

export const CLEARED_STATES = ["uncleared", "cleared", "reconciled"] as const;
export type ClearedState = (typeof CLEARED_STATES)[number];

export const transaction = pgTable(
  "transaction",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    accountId: text()
      .notNull()
      .references(() => budgetAccount.id, { onDelete: "cascade" }),
    /** Calendar date, YYYY-MM-DD. */
    date: date({ mode: "string" }).notNull(),
    /** Minor units; negative is an outflow. */
    amount: bigint({ mode: "bigint" }).notNull(),
    currency: char({ length: 3 }).$type<CurrencyCode>().notNull(),
    payeeId: text().references(() => payee.id, { onDelete: "set null" }),
    /** Null for off-budget accounts, credit-card starting debt and (later) transfers. */
    // No action (checked at statement end): a category with transactions can't be deleted on its
    // own, but whole-budget/account cascades still work.
    categoryId: text().references(() => category.id),
    memo: text().notNull().default(""),
    cleared: text({ enum: CLEARED_STATES }).notNull().default("uncleared"),
    approved: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("transaction_account_date_idx").on(t.accountId, t.date),
    index("transaction_budget_id_idx").on(t.budgetId),
    index("transaction_category_id_idx").on(t.categoryId),
    index("transaction_payee_id_idx").on(t.payeeId),
  ],
);
