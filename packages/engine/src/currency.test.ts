import { describe, expect, it } from "vitest";
import { assertCurrencyCode, CURRENCY_CODES, currencyExponent, isCurrencyCode } from "./currency";
import { UnknownCurrencyError } from "./errors";

describe("currency", () => {
  it("knows ISO-4217 exponents including zero- and three-decimal currencies", () => {
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("EUR")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KRW")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
    expect(currencyExponent("BHD")).toBe(3);
  });

  it("guards currency codes", () => {
    expect(isCurrencyCode("USD")).toBe(true);
    expect(isCurrencyCode("usd")).toBe(false);
    expect(isCurrencyCode("XXX")).toBe(false);
    expect(isCurrencyCode("toString")).toBe(false);
    expect(isCurrencyCode(42)).toBe(false);
  });

  it("asserts currency codes", () => {
    expect(assertCurrencyCode("GBP")).toBe("GBP");
    expect(() => assertCurrencyCode("ABC")).toThrow(UnknownCurrencyError);
  });

  it("exposes a sorted, duplicate-free code list", () => {
    expect(CURRENCY_CODES.length).toBeGreaterThan(150);
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
    expect([...CURRENCY_CODES].sort()).toEqual([...CURRENCY_CODES]);
  });
});
