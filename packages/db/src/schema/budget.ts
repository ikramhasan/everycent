import {
  CURRENCY_SYMBOL_POSITIONS,
  type CurrencyCode,
  DATE_FORMATS,
  NUMBER_FORMATS,
} from "@everycent/engine";
import {
  bigint,
  boolean,
  char,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { timestamps } from "./columns";

// Budgets are Better Auth organization-plugin tables, renamed via the plugin's `schema` option
// (organization → budget, member → budgetMember, invitation → budgetInvitation). Plugin field
// names must match exactly; `organizationId` is mapped to `budgetId`.

/**
 * YNAB has one role for everyone a plan is shared with (editor here). `viewer` is an everycent
 * extra (EVERYCENT-88): a member who can see the budget but not change it.
 */
export const BUDGET_ROLES = ["owner", "editor", "viewer"] as const;
/** The roles the owner can give someone they share the budget with. */
export const MEMBER_ROLES = ["editor", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
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
  /**
   * YNAB's plan setting `dismissed_loan_account_payoff_simulator_banner`: one dismissal hides the
   * loan payoff simulator banner on every loan, for everyone on the plan (checked 2026-10-14).
   */
  loanSimulatorBannerDismissed: boolean().notNull().default(false),
  /**
   * The order of the views Manage Views can rearrange: preset keys (`PRESET_BUDGET_VIEWS`) and
   * `budget_view` ids, shared by everyone on the budget. Null until first rearranged; entries it
   * lacks go last (see the views route).
   */
  viewOrder: text().array(),
  /**
   * Where the budget was imported from, e.g. "ynab:<plan id>" (EVERYCENT-69), so importing the
   * same plan again finds it instead of making a copy. Null for budgets made here.
   */
  importSource: text(),
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
    /** When this member last opened the budget (YNAB's plan list: "Last used 9 minutes ago"). */
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("budget_member_budget_user_idx").on(t.budgetId, t.userId),
    index("budget_member_user_id_idx").on(t.userId),
  ],
);

export const INVITATION_STATUSES = ["pending", "accepted", "canceled"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];
/** How the invitation's current link reached the invitee: our email, or shared by the owner. */
export const INVITATION_DELIVERIES = ["email", "link"] as const;

/**
 * An invitation to share a budget (YNAB Together's "Invite Member"). The plugin requires the
 * table; everycent's own `/v1` routes manage it (the plugin's endpoints are blocked).
 */
export const budgetInvitation = pgTable(
  "budget_invitation",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    email: text().notNull(),
    /** The invitee's first name, as the owner typed it (YNAB's "To"). */
    name: text().notNull().default(""),
    role: text(),
    status: text({ enum: INVITATION_STATUSES }).notNull().default("pending"),
    /** SHA-256 of the link's token; a resend or a new link replaces it. */
    tokenHash: text().unique(),
    /** A shared link gets no reminder email: the reminder's new link would replace it. */
    delivery: text({ enum: INVITATION_DELIVERIES }).notNull().default("email"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    /** When the expiry reminder went out (EVERYCENT-125); a resend clears it. */
    remindedAt: timestamp({ withTimezone: true }),
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
  /** YNAB's "Open last used plan by default": off opens the budget list instead. */
  openLastBudget: boolean().notNull().default(true),
  /** YNAB's "Enable keyboard shortcuts" (undo/redo included). */
  keyboardShortcuts: boolean().notNull().default(true),
  /**
   * The currency account totals and net worth are shown in, in every budget (EVERYCENT-57);
   * null is each budget's own currency.
   */
  displayCurrency: char({ length: 3 }).$type<CurrencyCode>(),
  ...timestamps,
});
