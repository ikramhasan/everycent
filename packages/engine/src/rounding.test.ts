import { describe, expect, it } from "vitest";
import { divideRounded } from "./rounding";

describe("divideRounded", () => {
  it("returns exact quotients unchanged", () => {
    expect(divideRounded(10n, 5n)).toBe(2n);
    expect(divideRounded(-10n, 5n)).toBe(-2n);
  });

  it("rounds half to even by default (banker's rounding)", () => {
    expect(divideRounded(25n, 10n)).toBe(2n); // 2.5 -> 2
    expect(divideRounded(35n, 10n)).toBe(4n); // 3.5 -> 4
    expect(divideRounded(-25n, 10n)).toBe(-2n);
    expect(divideRounded(-35n, 10n)).toBe(-4n);
    expect(divideRounded(26n, 10n)).toBe(3n);
    expect(divideRounded(24n, 10n)).toBe(2n);
  });

  it("supports half-up (away from zero), floor, ceil and trunc", () => {
    expect(divideRounded(25n, 10n, "half-up")).toBe(3n);
    expect(divideRounded(-25n, 10n, "half-up")).toBe(-3n);
    expect(divideRounded(-21n, 10n, "floor")).toBe(-3n);
    expect(divideRounded(21n, 10n, "floor")).toBe(2n);
    expect(divideRounded(21n, 10n, "ceil")).toBe(3n);
    expect(divideRounded(-21n, 10n, "ceil")).toBe(-2n);
    expect(divideRounded(-29n, 10n, "trunc")).toBe(-2n);
  });

  it("handles negative denominators and rejects zero", () => {
    expect(divideRounded(25n, -10n)).toBe(-2n);
    expect(() => divideRounded(1n, 0n)).toThrow(RangeError);
  });
});
