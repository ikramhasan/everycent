import { type Database, newId, sql } from "@everycent/db";
import {
  type ClearedState,
  category,
  categoryGroup,
  type FlagColor,
  type InternalCategoryKind,
  type InternalPayeeKind,
  payee,
  transaction,
} from "@everycent/db/schema";
import { type AccountType, isOnBudget } from "@everycent/engine";
import { and, eq, isNull, lte, max } from "drizzle-orm";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Db = Database | Tx;

const INTERNAL_PAYEE_NAMES: Record<InternalPayeeKind, string> = {
  starting_balance: "Starting Balance",
  manual_balance_adjustment: "Manual Balance Adjustment",
};

/** The budget's built-in payee of this kind, created on first use. */
export async function internalPayeeId(db: Db, budgetId: string, kind: InternalPayeeKind) {
  await db
    .insert(payee)
    .values({ id: newId(), budgetId, name: INTERNAL_PAYEE_NAMES[kind], internalKind: kind })
    .onConflictDoNothing();
  const [row] = await db
    .select({ id: payee.id })
    .from(payee)
    .where(and(eq(payee.budgetId, budgetId), eq(payee.internalKind, kind)));
  if (!row) throw new Error(`Internal payee ${kind} missing`);
  return row.id;
}

export function transferPayeeName(accountName: string) {
  return `Transfer : ${accountName}`;
}

/**
 * The account's "Transfer : <account>" payee. Created with the account; accounts from before
 * transfers existed get theirs here on first use.
 */
export async function transferPayeeId(
  db: Db,
  account: { id: string; budgetId: string; name: string },
) {
  await db
    .insert(payee)
    .values({
      id: newId(),
      budgetId: account.budgetId,
      name: transferPayeeName(account.name),
      transferAccountId: account.id,
    })
    .onConflictDoNothing();
  const [row] = await db
    .select({ id: payee.id })
    .from(payee)
    .where(eq(payee.transferAccountId, account.id));
  if (!row) throw new Error(`Transfer payee for ${account.id} missing`);
  return row.id;
}

/** Id of one of the budget's internal categories (seeded with every budget). */
export async function internalCategoryId(db: Db, budgetId: string, kind: InternalCategoryKind) {
  const [row] = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.budgetId, budgetId), eq(category.internalKind, kind)));
  if (!row) throw new Error(`Internal category ${kind} missing for budget ${budgetId}`);
  return row.id;
}

/** The "Credit Card Payments" group, created with the budget's first credit account. */
export async function creditCardPaymentsGroupId(db: Db, budgetId: string) {
  await db
    .insert(categoryGroup)
    .values({
      id: newId(),
      budgetId,
      name: "Credit Card Payments",
      sortOrder: -1,
      kind: "credit_card_payments",
    })
    .onConflictDoNothing();
  const [row] = await db
    .select({ id: categoryGroup.id })
    .from(categoryGroup)
    .where(
      and(eq(categoryGroup.budgetId, budgetId), eq(categoryGroup.kind, "credit_card_payments")),
    );
  if (!row) throw new Error("Credit Card Payments group missing");
  return row.id;
}

/** Adds a credit account's payment category at the end of the Credit Card Payments group. */
export async function createPaymentCategory(
  db: Db,
  budgetId: string,
  accountId: string,
  name: string,
) {
  const groupId = await creditCardPaymentsGroupId(db, budgetId);
  const [last] = await db
    .select({ value: max(category.sortOrder) })
    .from(category)
    .where(eq(category.groupId, groupId));
  await db.insert(category).values({
    id: newId(),
    budgetId,
    groupId,
    name,
    sortOrder: (last?.value ?? -1) + 1,
    linkedAccountId: accountId,
  });
}

export interface NewTransaction {
  budgetId: string;
  accountId: string;
  date: string;
  amount: bigint;
  currency: typeof transaction.$inferInsert.currency;
  payeeId: string | null;
  categoryId: string | null;
  cleared: ClearedState;
  memo?: string;
  flag?: FlagColor | null;
  transferTransactionId?: string | null;
  transferSubTransactionId?: string | null;
}

export async function insertTransaction(db: Db, values: NewTransaction) {
  const id = newId();
  await db.insert(transaction).values({ id, ...values });
  return id;
}

/**
 * The budget's payee with this name (ignoring case), created if there's none. Internal payees
 * match too, so typing "Starting Balance" picks the real one instead of failing. Transfer payees
 * don't: a transfer is asked for by account.
 */
export async function findOrCreatePayee(db: Db, budgetId: string, name: string) {
  await db.insert(payee).values({ id: newId(), budgetId, name }).onConflictDoNothing();
  const [row] = await db
    .select({ id: payee.id })
    .from(payee)
    .where(
      and(
        eq(payee.budgetId, budgetId),
        isNull(payee.transferAccountId),
        sql`lower(${payee.name}) = lower(${name})`,
      ),
    );
  if (!row) throw new Error(`Payee ${name} missing`);
  return row.id;
}

/** The server's calendar date, for requests that weren't given the user's today. */
export function serverToday() {
  return new Date().toISOString().slice(0, 10);
}

export interface AccountBalances {
  cleared: bigint;
  uncleared: bigint;
  working: bigint;
}

/**
 * Cleared (incl. reconciled), uncleared and working balances for each account of the budget, as
 * of `today` (the user's calendar date): future-dated transactions don't count until their date.
 */
export async function accountBalances(db: Db, budgetId: string, today: string) {
  const rows = await db
    .select({
      accountId: transaction.accountId,
      cleared: sql<string>`coalesce(sum(${transaction.amount}) filter (where ${transaction.cleared} <> 'uncleared'), 0)`,
      uncleared: sql<string>`coalesce(sum(${transaction.amount}) filter (where ${transaction.cleared} = 'uncleared'), 0)`,
    })
    .from(transaction)
    .where(and(eq(transaction.budgetId, budgetId), lte(transaction.date, today)))
    .groupBy(transaction.accountId);
  const balances = new Map<string, AccountBalances>();
  for (const row of rows) {
    // Postgres returns numeric sums as strings; BigInt parses them exactly.
    const cleared = BigInt(row.cleared);
    const uncleared = BigInt(row.uncleared);
    balances.set(row.accountId, { cleared, uncleared, working: cleared + uncleared });
  }
  return balances;
}

export const ZERO_BALANCES: AccountBalances = { cleared: 0n, uncleared: 0n, working: 0n };

/**
 * An account's Starting Balance, as YNAB records it: money in budget accounts goes to Ready to
 * Assign; credit debt stays uncategorized until phase 7 (docs/deferred.md); off-budget accounts
 * never have a category.
 */
export async function insertStartingBalance(
  db: Db,
  input: {
    budgetId: string;
    accountId: string;
    type: AccountType;
    amount: bigint;
    currency: NewTransaction["currency"];
    date: string;
  },
) {
  const toReadyToAssign = isOnBudget(input.type) && input.amount >= 0n;
  await insertTransaction(db, {
    budgetId: input.budgetId,
    accountId: input.accountId,
    date: input.date,
    amount: input.amount,
    currency: input.currency,
    payeeId: await internalPayeeId(db, input.budgetId, "starting_balance"),
    categoryId: toReadyToAssign
      ? await internalCategoryId(db, input.budgetId, "ready_to_assign")
      : null,
    cleared: "cleared",
  });
}
