import type { CurrencyCode } from "./currency";
import { CurrencyMismatchError } from "./errors";

/** An exact monetary amount in the currency's minor units (e.g. cents). */
export interface Money {
  readonly amount: bigint;
  readonly currency: CurrencyCode;
}

export function money(amount: bigint, currency: CurrencyCode): Money {
  return Object.freeze({ amount, currency });
}

export function zero(currency: CurrencyCode): Money {
  return money(0n, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function negate(m: Money): Money {
  return money(-m.amount, m.currency);
}

export const isZero = (m: Money): boolean => m.amount === 0n;
export const isNegative = (m: Money): boolean => m.amount < 0n;
export const isPositive = (m: Money): boolean => m.amount > 0n;

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

/** Sums amounts; `currency` is required so an empty list still has a currency. */
export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce(add, zero(currency));
}
