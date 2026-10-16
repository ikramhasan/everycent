import { budget, subTransaction, transaction } from "@everycent/db/schema";
import { type CurrencyCode, convert, convertLines, money, normalizeRate } from "@everycent/engine";
import { asc, eq } from "drizzle-orm";
import type { AppDeps } from "../types";
import { resolveRate } from "./fx";
import type { Db } from "./ledger";

export type FxDeps = Pick<AppDeps, "fxProviders" | "serverDate">;

/** What the budget's math sees of a transaction: its amount in the budget's currency, and how. */
export interface BaseFields {
  baseAmount: bigint;
  fxRate: string | null;
  fxRateManual: boolean;
}

export interface BaseInput {
  budgetId: string;
  budgetCurrency: CurrencyCode;
  /** The account's currency. */
  currency: CurrencyCode;
  date: string;
  amount: bigint;
  /** A rate typed by hand; otherwise the date's rate is looked up. */
  rate?: string | null;
  /** The user's today: a later date uses today's rate. */
  today?: string;
}

/** The rate for a transaction: typed by hand, or the budget's rate for its date. */
export async function rateFor(db: Db, deps: FxDeps, input: Omit<BaseInput, "amount">) {
  if (input.currency === input.budgetCurrency) return { fxRate: null, fxRateManual: false };
  if (input.rate) return { fxRate: normalizeRate(input.rate), fxRateManual: true };
  const { rate } = await resolveRate(db, deps, {
    budgetId: input.budgetId,
    from: input.currency,
    to: input.budgetCurrency,
    date: input.date,
    today: input.today,
  });
  return { fxRate: rate, fxRateManual: false };
}

/**
 * Converts a transaction's amount into the budget's currency, once (EVERYCENT-54): an account in
 * the budget's currency keeps its amount; a foreign one converts at the typed rate or the date's.
 */
export async function baseFields(db: Db, deps: FxDeps, input: BaseInput): Promise<BaseFields> {
  const { fxRate, fxRateManual } = await rateFor(db, deps, input);
  return {
    baseAmount: toBase(input.amount, input.currency, fxRate, input.budgetCurrency),
    fxRate,
    fxRateManual,
  };
}

/** `amount` in the budget's currency at `fxRate` (null: already in it). */
export function toBase(
  amount: bigint,
  currency: CurrencyCode,
  fxRate: string | null,
  budgetCurrency: CurrencyCode,
) {
  if (fxRate === null || currency === budgetCurrency) return amount;
  return convert(money(amount, currency), fxRate, budgetCurrency).amount;
}

/** A split's lines in the budget's currency, adding up to the parent's base amount. */
export function linesToBase(
  amount: bigint,
  lines: readonly bigint[],
  currency: CurrencyCode,
  fxRate: string | null,
  budgetCurrency: CurrencyCode,
) {
  if (fxRate === null || currency === budgetCurrency) return [...lines];
  return convertLines(money(amount, currency), lines, fxRate, budgetCurrency).lines;
}

/** The budget's currency (its base: what every base amount is in). */
export async function budgetCurrencyOf(db: Db, budgetId: string): Promise<CurrencyCode> {
  const [row] = await db
    .select({ currency: budget.currency })
    .from(budget)
    .where(eq(budget.id, budgetId));
  if (!row) throw new Error(`Budget ${budgetId} missing`);
  return row.currency;
}

/**
 * The base fields for an edit of a transaction (the rate lock): a typed rate wins; a cleared one
 * (null) goes back to the date's rate; otherwise the rate stays unless the date changed and it
 * wasn't typed, so editing only the amount keeps it.
 */
export async function rebase(
  db: Db,
  deps: FxDeps,
  existing: { budgetId: string; date: string; fxRate: string | null; fxRateManual: boolean },
  next: { currency: CurrencyCode; date: string; amount: bigint; rate?: string | null },
): Promise<BaseFields> {
  const budgetCurrency = await budgetCurrencyOf(db, existing.budgetId);
  const input = { budgetId: existing.budgetId, budgetCurrency, ...next };
  if (next.currency === budgetCurrency || next.rate !== undefined) {
    return baseFields(db, deps, input);
  }
  const keep = existing.fxRate !== null && (existing.fxRateManual || next.date === existing.date);
  if (!keep) return baseFields(db, deps, input);
  const fxRate = normalizeRate(existing.fxRate as string);
  return {
    baseAmount: toBase(next.amount, next.currency, fxRate, budgetCurrency),
    fxRate,
    fxRateManual: existing.fxRateManual,
  };
}

/**
 * Brings what follows a transaction's base amount in line with it: a split's lines (at its rate,
 * adding up to it), the other side of a transfer and of each transfer line (always the opposite
 * base amount, so a transfer moves no money in the budget).
 */
export async function syncBases(db: Db, transactionId: string) {
  const [parent] = await db
    .select({
      amount: transaction.amount,
      currency: transaction.currency,
      baseAmount: transaction.baseAmount,
      fxRate: transaction.fxRate,
      budgetCurrency: budget.currency,
      transferTransactionId: transaction.transferTransactionId,
    })
    .from(transaction)
    .innerJoin(budget, eq(budget.id, transaction.budgetId))
    .where(eq(transaction.id, transactionId));
  if (!parent) return;
  const lines = await db
    .select({ id: subTransaction.id, amount: subTransaction.amount })
    .from(subTransaction)
    .where(eq(subTransaction.transactionId, transactionId))
    .orderBy(asc(subTransaction.sortOrder));
  const fxRate = parent.fxRate === null ? null : normalizeRate(parent.fxRate);
  const bases =
    fxRate === null
      ? lines.map((l) => l.amount)
      : linesToBase(
          parent.amount,
          lines.map((l) => l.amount),
          parent.currency,
          fxRate,
          parent.budgetCurrency,
        );
  for (const [i, line] of lines.entries()) {
    const baseAmount = bases[i] as bigint;
    await db.update(subTransaction).set({ baseAmount }).where(eq(subTransaction.id, line.id));
    await db
      .update(transaction)
      .set({ baseAmount: -baseAmount, fxRate })
      .where(eq(transaction.transferSubTransactionId, line.id));
  }
  if (parent.transferTransactionId) {
    await db
      .update(transaction)
      .set({ baseAmount: -parent.baseAmount, fxRate })
      .where(eq(transaction.id, parent.transferTransactionId));
  }
}
