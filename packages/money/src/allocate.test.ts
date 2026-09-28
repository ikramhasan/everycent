import { describe, expect, it } from "vitest";
import { allocate } from "./allocate";
import { money, sum } from "./money";

const usd = (n: bigint) => money(n, "USD");

describe("allocate", () => {
  it("splits without losing a cent, giving leftovers to the largest remainders first", () => {
    expect(allocate(usd(100n), [1, 1, 1])).toEqual([usd(34n), usd(33n), usd(33n)]);
    expect(allocate(usd(100n), [70, 30])).toEqual([usd(70n), usd(30n)]);
    expect(allocate(usd(5n), [3, 7])).toEqual([usd(2n), usd(3n)]); // 1.5 / 3.5 -> tie broken by index
  });

  it("mirrors the split for negative amounts", () => {
    expect(allocate(usd(-100n), [1, 1, 1])).toEqual([usd(-34n), usd(-33n), usd(-33n)]);
  });

  it("never gives anything to a zero ratio", () => {
    expect(allocate(usd(5n), [0, 1])).toEqual([usd(0n), usd(5n)]);
  });

  it("always preserves the total", () => {
    for (let amount = -250n; amount <= 250n; amount += 7n) {
      const parts = allocate(usd(amount), [3, 5, 11, 1]);
      expect(sum(parts, "USD")).toEqual(usd(amount));
    }
  });

  it("rejects empty, negative, fractional or all-zero ratios", () => {
    expect(() => allocate(usd(1n), [])).toThrow(RangeError);
    expect(() => allocate(usd(1n), [-1, 2])).toThrow(RangeError);
    expect(() => allocate(usd(1n), [1.5, 2])).toThrow(RangeError);
    expect(() => allocate(usd(1n), [0, 0])).toThrow(RangeError);
  });
});
