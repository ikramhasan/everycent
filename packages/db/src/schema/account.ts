import {
  ACCOUNT_TYPES,
  type CurrencyCode,
  LOAN_CHARGE_KINDS,
  LOAN_CHARGE_STATUSES,
  PAYEE_CATEGORIZATIONS,
  SCHEDULE_FREQUENCIES,
} from "@everycent/engine";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
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
    /**
     * Position in the sidebar's Starred group (ascending); null when not starred. Shared by
     * everyone on the budget, like YNAB's web `is_favorite` / `sortable_favorite_index`. Closing
     * the account clears it.
     */
    starredSortOrder: integer(),
    /** Currency of every amount in this account. For now always the budget's (see Design notes). */
    currency: char({ length: 3 }).$type<CurrencyCode>().notNull(),
    /** Loan accounts: annual interest rate in percent, e.g. "6.125". */
    interestRate: numeric({ precision: 6, scale: 3 }),
    /** Loan accounts: monthly minimum payment, in `currency` minor units. */
    minimumPayment: bigint({ mode: "bigint" }),
    /** Loan accounts: monthly escrow, in `currency` minor units. */
    escrowAmount: bigint({ mode: "bigint" }),
    /** When the account was last reconciled (YNAB's "Reconciled 9 days ago"); null if never. */
    lastReconciledAt: timestamp({ withTimezone: true }),
    /**
     * Loan accounts: the plan category paired with it (YNAB's "Paired Plan Category"), which its
     * payments come out of. One loan per category; deleting the category unpairs it.
     */
    pairedCategoryId: text().references((): AnyPgColumn => category.id, { onDelete: "set null" }),
    /**
     * Loan accounts: "Another debt bites the dust" was dismissed (YNAB's plan setting
     * `loan_payoff_celebration_completed_for_account_ids`, per loan, checked 2026-10-14).
     */
    paidOffBannerDismissed: boolean().notNull().default(false),
    /**
     * A tracking liability updated to a loan account (YNAB's "Update to a Loan Account"): the new
     * loan. The original stays closed with its history, which the loan's page shows.
     */
    migratedToAccountId: text().references((): AnyPgColumn => budgetAccount.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("budget_account_budget_id_idx").on(t.budgetId),
    uniqueIndex("budget_account_paired_category_idx").on(t.pairedCategoryId),
  ],
);

/**
 * A loan's interest rate, minimum payment and escrow from `month` on, as YNAB keeps them per month
 * (a change applies "for October and going forward"). The account's own columns hold the latest.
 */
export const loanTerms = pgTable(
  "loan_terms",
  {
    id: text().primaryKey(),
    accountId: text()
      .notNull()
      .references(() => budgetAccount.id, { onDelete: "cascade" }),
    /** First day of the month, YYYY-MM-01. */
    month: date({ mode: "string" }).notNull(),
    interestRate: numeric({ precision: 6, scale: 3 }),
    minimumPayment: bigint({ mode: "bigint" }),
    escrowAmount: bigint({ mode: "bigint" }),
    currency: char({ length: 3 }).$type<CurrencyCode>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("loan_terms_account_month_idx").on(t.accountId, t.month)],
);

/**
 * A loan month's interest or escrow set by hand (YNAB's "Edited on October 13") or fixed by
 * Update Balance ("Reconciled"). Months without a row are estimated from the loan's terms.
 */
export const loanCharge = pgTable(
  "loan_charge",
  {
    id: text().primaryKey(),
    accountId: text()
      .notNull()
      .references(() => budgetAccount.id, { onDelete: "cascade" }),
    /** First day of the month, YYYY-MM-01. */
    month: date({ mode: "string" }).notNull(),
    kind: text({ enum: LOAN_CHARGE_KINDS }).notNull(),
    /** Minor units added to the debt (positive). */
    amount: bigint({ mode: "bigint" }).notNull(),
    currency: char({ length: 3 }).$type<CurrencyCode>().notNull(),
    status: text({ enum: LOAN_CHARGE_STATUSES }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("loan_charge_account_month_kind_idx").on(t.accountId, t.month, t.kind)],
);

/** Payees YNAB creates itself and people can't rename or merge. */
export const INTERNAL_PAYEE_KINDS = [
  "starting_balance",
  "manual_balance_adjustment",
  "reconciliation_balance_adjustment",
] as const;
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
    /**
     * Set on an account's "Transfer : <account>" payee. Its name follows the account's, so it's
     * left out of the unique name index (two accounts may share a name).
     */
    transferAccountId: text().references(() => budgetAccount.id, { onDelete: "cascade" }),
    /** Hidden payees aren't suggested in the payee field, but typing the exact name still uses them. */
    hidden: boolean().notNull().default(false),
    /** Manage Payees' Categorization: how a new transaction for this payee gets its category. */
    categorization: text({ enum: PAYEE_CATEGORIZATIONS }).notNull().default("auto"),
    /** The "Always use my choice" category. */
    defaultCategoryId: text().references(() => category.id, { onDelete: "set null" }),
    /**
     * An auto-categorization default from before the payee's own history, copied by a fresh start
     * (which leaves the transactions behind). The history's two-of-three rule builds on it.
     */
    carriedCategoryId: text().references(() => category.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("payee_budget_id_idx").on(t.budgetId),
    // YNAB treats "Costco" and "costco" as the same payee.
    uniqueIndex("payee_name_per_budget_idx")
      .on(t.budgetId, sql`lower(${t.name})`)
      .where(sql`${t.transferAccountId} is null`),
    uniqueIndex("payee_transfer_account_idx").on(t.transferAccountId),
    uniqueIndex("payee_internal_kind_per_budget_idx")
      .on(t.budgetId, t.internalKind)
      .where(sql`${t.internalKind} is not null`),
  ],
);

export const CLEARED_STATES = ["uncleared", "cleared", "reconciled"] as const;
export type ClearedState = (typeof CLEARED_STATES)[number];

/** YNAB's six flag colors; each budget can name them (see `flagName`). */
export const FLAG_COLORS = ["red", "orange", "yellow", "green", "blue", "purple"] as const;
export type FlagColor = (typeof FLAG_COLORS)[number];

/**
 * A budget's name for a flag color (e.g. red = "Reimbursable"), shared by everyone on the budget
 * as in YNAB. Colors without a row have no name.
 */
export const flagName = pgTable(
  "flag_name",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    color: text({ enum: FLAG_COLORS }).notNull(),
    name: text().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("flag_name_budget_color_idx").on(t.budgetId, t.color)],
);

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
    /**
     * Null for off-budget accounts, credit-card starting debt and transfers between two budget
     * accounts (or two tracking accounts).
     */
    // No action (checked at statement end): a category with transactions can't be deleted on its
    // own, but whole-budget/account cascades still work.
    categoryId: text().references(() => category.id),
    memo: text().notNull().default(""),
    cleared: text({ enum: CLEARED_STATES }).notNull().default("uncleared"),
    /** Per side on transfers, like memo and cleared. */
    flag: text({ enum: FLAG_COLORS }),
    approved: boolean().notNull().default(true),
    /**
     * The other side of a transfer, in the account named by this transaction's transfer payee.
     * Both sides point at each other; their amounts are always opposite.
     */
    transferTransactionId: text().references((): AnyPgColumn => transaction.id, {
      onDelete: "set null",
    }),
    /**
     * Set instead of `transferTransactionId` when the other side is a line of a split: that line
     * owns the date and amount, so they're edited from the split.
     */
    transferSubTransactionId: text().references((): AnyPgColumn => subTransaction.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("transaction_transfer_transaction_idx").on(t.transferTransactionId),
    uniqueIndex("transaction_transfer_sub_transaction_idx").on(t.transferSubTransactionId),
    index("transaction_account_date_idx").on(t.accountId, t.date),
    index("transaction_budget_id_idx").on(t.budgetId),
    index("transaction_category_id_idx").on(t.categoryId),
    index("transaction_payee_id_idx").on(t.payeeId),
  ],
);

/**
 * The lines of a split transaction. A split's own category is null; its lines carry the
 * categories and always add up to its amount. A line can be a transfer: then its payee is the
 * other account's transfer payee and a transaction there points back with
 * `transferSubTransactionId`.
 */
export const subTransaction = pgTable(
  "sub_transaction",
  {
    id: text().primaryKey(),
    transactionId: text()
      .notNull()
      .references(() => transaction.id, { onDelete: "cascade" }),
    /** Order within the split (ascending). */
    sortOrder: integer().notNull(),
    /** Minor units; negative is an outflow. */
    amount: bigint({ mode: "bigint" }).notNull(),
    /** Always the parent transaction's currency. */
    currency: char({ length: 3 }).$type<CurrencyCode>().notNull(),
    payeeId: text().references(() => payee.id, { onDelete: "set null" }),
    /** Same rules as a transaction's category (no action: see `transaction.categoryId`). */
    categoryId: text().references(() => category.id),
    memo: text().notNull().default(""),
    ...timestamps,
  },
  (t) => [
    index("sub_transaction_transaction_id_idx").on(t.transactionId),
    index("sub_transaction_category_id_idx").on(t.categoryId),
  ],
);

/**
 * A scheduled transaction: a future one-off (frequency "never") or a repeating one. YNAB keeps one
 * row per schedule showing its next occurrence; due occurrences become transactions (see
 * `enterDueScheduled` in the API). A transfer's payee is the other account's transfer payee, as on
 * transactions; there's no second row, the other account shows this one with the amount negated.
 */
export const scheduledTransaction = pgTable(
  "scheduled_transaction",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    accountId: text()
      .notNull()
      .references(() => budgetAccount.id, { onDelete: "cascade" }),
    frequency: text({ enum: SCHEDULE_FREQUENCIES }).notNull(),
    /** Where the repeats are counted from (YYYY-MM-DD); editing the date restarts it there. */
    dateFirst: date({ mode: "string" }).notNull(),
    /** The next occurrence, the one the register shows (YYYY-MM-DD). */
    dateNext: date({ mode: "string" }).notNull(),
    /** Minor units; negative is an outflow. */
    amount: bigint({ mode: "bigint" }).notNull(),
    currency: char({ length: 3 }).$type<CurrencyCode>().notNull(),
    payeeId: text().references(() => payee.id, { onDelete: "set null" }),
    /** Same rules as a transaction's (no action: see `transaction.categoryId`); null on splits. */
    categoryId: text().references(() => category.id),
    memo: text().notNull().default(""),
    flag: text({ enum: FLAG_COLORS }),
    ...timestamps,
  },
  (t) => [
    index("scheduled_transaction_budget_next_idx").on(t.budgetId, t.dateNext),
    index("scheduled_transaction_account_id_idx").on(t.accountId),
    index("scheduled_transaction_category_id_idx").on(t.categoryId),
    index("scheduled_transaction_payee_id_idx").on(t.payeeId),
  ],
);

/** The lines of a scheduled split; same rules as `subTransaction`. */
export const scheduledSubTransaction = pgTable(
  "scheduled_sub_transaction",
  {
    id: text().primaryKey(),
    scheduledTransactionId: text()
      .notNull()
      .references(() => scheduledTransaction.id, { onDelete: "cascade" }),
    sortOrder: integer().notNull(),
    amount: bigint({ mode: "bigint" }).notNull(),
    currency: char({ length: 3 }).$type<CurrencyCode>().notNull(),
    payeeId: text().references(() => payee.id, { onDelete: "set null" }),
    categoryId: text().references(() => category.id),
    memo: text().notNull().default(""),
    ...timestamps,
  },
  (t) => [
    index("scheduled_sub_transaction_parent_idx").on(t.scheduledTransactionId),
    index("scheduled_sub_transaction_category_id_idx").on(t.categoryId),
  ],
);
