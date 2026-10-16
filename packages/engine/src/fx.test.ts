import { describe, expect, it } from "vitest";
import {
  convert,
  convertLines,
  crossRate,
  impliedRate,
  invertRate,
  normalizeRate,
  parseJsonExact,
  parseJsonRates,
  rateToScaled,
  roundRate,
} from "./fx";
import { money } from "./money";

describe("normalizeRate", () => {
  it("keeps up to 12 decimals exactly and trims trailing zeros", () => {
    expect(normalizeRate("1.084200000000")).toBe("1.0842");
    expect(normalizeRate("149")).toBe("149");
    expect(normalizeRate("0.000000000001")).toBe("0.000000000001");
    expect(normalizeRate("1.123456789012")).toBe("1.123456789012");
  });

  it("rounds half-even at the 12th decimal", () => {
    expect(normalizeRate("1.123456789012345")).toBe("1.123456789012");
    expect(normalizeRate("1.1234567890125")).toBe("1.123456789012"); // tie -> even
    expect(normalizeRate("1.1234567890135")).toBe("1.123456789014"); // tie -> even
    expect(normalizeRate("1.12345678901250001")).toBe("1.123456789013");
    expect(normalizeRate("0.9999999999995")).toBe("1"); // tie, ...999 odd -> up
  });

  it("reads JSON exponent forms", () => {
    expect(normalizeRate("1.5e-7")).toBe("0.00000015");
    expect(normalizeRate("2E3")).toBe("2000");
  });

  it("rejects malformed, zero and too-small rates", () => {
    for (const rate of [
      "",
      "abc",
      "-1",
      "0",
      "0.0",
      "1.",
      ".5",
      " 1",
      "0.0000000000004",
      "1e999",
    ]) {
      expect(() => normalizeRate(rate), rate).toThrow(RangeError);
    }
  });

  it("scales to integer units of 10^-12", () => {
    expect(rateToScaled("1.0842")).toBe(1_084_200_000_000n);
  });
});

describe("invertRate / crossRate", () => {
  it("inverts exactly when it can, else half-even at 12 decimals", () => {
    expect(invertRate("0.5")).toBe("2");
    expect(invertRate("4")).toBe("0.25");
    expect(invertRate("3")).toBe("0.333333333333");
    expect(invertRate("1.0842")).toBe("0.922339051835");
  });

  it("crosses through a pivot without intermediate rounding", () => {
    // 1 EUR = 1.0842 USD, 1 GBP = 1.2650 USD -> 1 EUR = 0.857075098814... GBP
    expect(crossRate("1.0842", "1.265")).toBe("0.857075098814");
    expect(crossRate("2", "2")).toBe("1");
    expect(crossRate("1", "8")).toBe("0.125");
  });
});

describe("parseJsonRates", () => {
  it("reads rates from the source text, with no float drift", () => {
    const body =
      '{"amount":1.0,"base":"EUR","date":"2024-03-01","rates":{"GBP":0.85588,"JPY":162.82,"USD":1.123456789012345678}}';
    expect(parseJsonRates(body, "rates")).toEqual({
      date: "2024-03-01",
      rates: { GBP: "0.85588", JPY: "162.82", USD: "1.123456789012" },
    });
  });

  it("upper-cases codes and skips tokens, zeros and non-numbers", () => {
    const body =
      '{"date":"2024-03-06","eur":{"$myro":3.59,"1inch":2.01,"usd":1.08600114,"zzz":0,"bdt":"x","jpy":161.98411296}}';
    expect(parseJsonRates(body, "eur")).toEqual({
      date: "2024-03-06",
      rates: { USD: "1.08600114", JPY: "161.98411296" },
    });
  });

  it("refuses a body without the rates object", () => {
    expect(() => parseJsonRates('{"message":"not found"}', "rates")).toThrow();
    expect(() => parseJsonRates("[1]", "rates")).toThrow();
  });

  it("keeps every number as its source text", () => {
    expect(parseJsonExact('{"a":[0.1,1e-7,123456789012345678901234567890]}')).toEqual({
      a: ["0.1", "1e-7", "123456789012345678901234567890"],
    });
  });
});

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

describe("convertLines", () => {
  it("keeps the lines adding up to the converted parent", () => {
    // 3 × €0.01 at 1.5: each line is 1.5¢ → 2¢ (half-even), the parent 4.5¢ → 4¢.
    const result = convertLines(money(-3n, "EUR"), [-1n, -1n, -1n], "1.5", "USD");
    expect(result.amount).toBe(-4n);
    expect(result.lines.reduce((a, b) => a + b, 0n)).toBe(-4n);
    // Each line rounds to −2¢ (−6¢ in all); the +2¢ difference goes to the first line.
    expect(result.lines).toEqual([0n, -2n, -2n]);
  });

  it("gives the difference to the largest line, across exponents and mixed signs", () => {
    // ¥1,001 + ¥-1 at 0.0067 USD: parent ¥1,000 → $6.70; lines $6.71 (6.7067) and −$0.01 (0.0067).
    const result = convertLines(money(1000n, "JPY"), [1001n, -1n], "0.0067", "USD");
    expect(result.amount).toBe(670n);
    expect(result.lines).toEqual([671n, -1n]);
    // KWD has three decimals: 1.235 KWD + 1.235 KWD at 3.25 → $4.01375 each, $8.0275 total.
    const kwd = convertLines(money(2470n, "KWD"), [1235n, 1235n], "3.25", "USD");
    expect(kwd.amount).toBe(803n);
    expect(kwd.lines.reduce((a, b) => a + b, 0n)).toBe(803n);
  });
});

describe("impliedRate", () => {
  it("is the rate between two amounts in their own exponents", () => {
    expect(impliedRate(money(-10000n, "JPY"), money(-6700n, "USD"))).toBe("0.0067");
    expect(impliedRate(money(1000n, "KWD"), money(325n, "USD"))).toBe("3.25");
    expect(impliedRate(money(300n, "EUR"), money(100n, "USD"))).toBe("0.333333333333");
  });

  it("is null for zero or opposite signs", () => {
    expect(impliedRate(money(0n, "EUR"), money(100n, "USD"))).toBeNull();
    expect(impliedRate(money(-1n, "EUR"), money(1n, "USD"))).toBeNull();
  });
});

describe("roundRate", () => {
  it("keeps six significant digits by default, rounding half-even", () => {
    expect(roundRate("1.176470588235")).toBe("1.17647");
    expect(roundRate("0.006666666667")).toBe("0.00666667");
    expect(roundRate("150")).toBe("150");
    expect(roundRate("1.0842")).toBe("1.0842");
    expect(roundRate("9.9999995")).toBe("10");
    expect(roundRate("1.23455", 5)).toBe("1.2346");
  });
});
