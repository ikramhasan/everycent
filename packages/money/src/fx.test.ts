import { describe, expect, it } from "vitest";
import { convert } from "./fx";
import { money } from "./money";

describe("convert", () => {
  it("converts between two-decimal currencies", () => {
    expect(convert(money(10000n, "USD"), "0.9235", "EUR")).toEqual(money(9235n, "EUR"));
  });

  it("converts into and out of zero-decimal currencies", () => {
    expect(convert(money(100n, "USD"), "149.5", "JPY")).toEqual(money(150n, "JPY")); // 149.5 -> 150 (even)
    expect(convert(money(1000n, "JPY"), "0.0067", "USD")).toEqual(money(670n, "USD"));
  });

  it("uses banker's rounding by default and honours an explicit mode", () => {
    // 0.05 USD * 0.5 = 0.025 -> tie
    expect(convert(money(5n, "USD"), "0.5", "EUR")).toEqual(money(2n, "EUR"));
    expect(convert(money(5n, "USD"), "0.5", "EUR", "half-up")).toEqual(money(3n, "EUR"));
    expect(convert(money(-5n, "USD"), "0.5", "EUR")).toEqual(money(-2n, "EUR"));
    expect(convert(money(-5n, "USD"), "0.5", "EUR", "half-up")).toEqual(money(-3n, "EUR"));
  });

  it("rejects malformed or non-positive rates", () => {
    for (const rate of ["", "abc", "-1", "0", "0.000", "1e3", "1.", ".5"]) {
      expect(() => convert(money(1n, "USD"), rate, "EUR"), rate).toThrow(RangeError);
    }
  });
});
