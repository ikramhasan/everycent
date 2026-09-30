import { describe, expect, it } from "vitest";
import { CurrencyMismatchError } from "./errors";
import {
  add,
  compare,
  equals,
  isNegative,
  isPositive,
  isZero,
  money,
  negate,
  subtract,
  sum,
  zero,
} from "./money";

const usd = (n: bigint) => money(n, "USD");

describe("money arithmetic", () => {
  it("adds and subtracts same-currency amounts", () => {
    expect(add(usd(150n), usd(275n))).toEqual(usd(425n));
    expect(subtract(usd(150n), usd(275n))).toEqual(usd(-125n));
  });

  it("refuses to mix currencies", () => {
    expect(() => add(usd(1n), money(1n, "EUR"))).toThrow(CurrencyMismatchError);
    expect(() => subtract(usd(1n), money(1n, "EUR"))).toThrow(CurrencyMismatchError);
    expect(() => compare(usd(1n), money(1n, "EUR"))).toThrow(CurrencyMismatchError);
  });

  it("negates and classifies sign", () => {
    expect(negate(usd(5n))).toEqual(usd(-5n));
    expect(isZero(zero("USD"))).toBe(true);
    expect(isNegative(usd(-1n))).toBe(true);
    expect(isPositive(usd(1n))).toBe(true);
    expect(isPositive(usd(0n))).toBe(false);
  });

  it("compares and checks equality", () => {
    expect(compare(usd(1n), usd(2n))).toBe(-1);
    expect(compare(usd(2n), usd(2n))).toBe(0);
    expect(compare(usd(3n), usd(2n))).toBe(1);
    expect(equals(usd(2n), usd(2n))).toBe(true);
    expect(equals(usd(2n), money(2n, "EUR"))).toBe(false);
  });

  it("sums a list, including the empty list", () => {
    expect(sum([usd(1n), usd(2n), usd(3n)], "USD")).toEqual(usd(6n));
    expect(sum([], "USD")).toEqual(usd(0n));
    expect(() => sum([money(1n, "EUR")], "USD")).toThrow(CurrencyMismatchError);
  });

  it("produces immutable values", () => {
    expect(Object.isFrozen(usd(1n))).toBe(true);
  });
});
