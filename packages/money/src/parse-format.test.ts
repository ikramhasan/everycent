import { describe, expect, it } from "vitest";
import { MoneyParseError } from "./errors";
import { money } from "./money";
import { formatMoney, parseMoney, toDecimalString } from "./parse-format";

describe("parseMoney", () => {
  it("parses decimal strings into minor units", () => {
    expect(parseMoney("12.34", "USD")).toEqual(money(1234n, "USD"));
    expect(parseMoney("12.3", "USD")).toEqual(money(1230n, "USD"));
    expect(parseMoney("12", "USD")).toEqual(money(1200n, "USD"));
    expect(parseMoney(".5", "USD")).toEqual(money(50n, "USD"));
    expect(parseMoney("12.", "USD")).toEqual(money(1200n, "USD"));
    expect(parseMoney("-0.01", "USD")).toEqual(money(-1n, "USD"));
    expect(parseMoney("+7", "USD")).toEqual(money(700n, "USD"));
  });

  it("ignores grouping separators and surrounding whitespace", () => {
    expect(parseMoney(" 1,234,567.89 ", "USD")).toEqual(money(123456789n, "USD"));
    expect(parseMoney("1_000", "JPY")).toEqual(money(1000n, "JPY"));
  });

  it("respects the currency exponent", () => {
    expect(parseMoney("1500", "JPY")).toEqual(money(1500n, "JPY"));
    expect(parseMoney("1.234", "KWD")).toEqual(money(1234n, "KWD"));
  });

  it("rejects input it would otherwise have to round or guess", () => {
    for (const [input, currency] of [
      ["1.234", "USD"],
      ["1.5", "JPY"],
      ["abc", "USD"],
      ["", "USD"],
      ["-", "USD"],
      [".", "USD"],
      ["1.2.3", "USD"],
      ["1e5", "USD"],
      ["--1", "USD"],
    ] as const) {
      expect(() => parseMoney(input, currency), input).toThrow(MoneyParseError);
    }
  });

  it("parses amounts beyond Number.MAX_SAFE_INTEGER exactly", () => {
    expect(parseMoney("90071992547409931234.56", "USD")).toEqual(
      money(9007199254740993123456n, "USD"),
    );
  });
});

describe("toDecimalString", () => {
  it("renders minor units as an exact decimal string", () => {
    expect(toDecimalString(money(1234n, "USD"))).toBe("12.34");
    expect(toDecimalString(money(5n, "USD"))).toBe("0.05");
    expect(toDecimalString(money(-5n, "USD"))).toBe("-0.05");
    expect(toDecimalString(money(0n, "USD"))).toBe("0.00");
    expect(toDecimalString(money(1500n, "JPY"))).toBe("1500");
    expect(toDecimalString(money(1n, "KWD"))).toBe("0.001");
  });

  it("round-trips with parseMoney", () => {
    for (const s of ["0.00", "-123.45", "99999999999999999999.99"]) {
      expect(toDecimalString(parseMoney(s, "USD"))).toBe(s);
    }
  });
});

describe("formatMoney", () => {
  it("formats with the currency's fraction digits", () => {
    expect(formatMoney(money(123456n, "USD"))).toBe("$1,234.56");
    expect(formatMoney(money(-5n, "USD"))).toBe("-$0.05");
    expect(formatMoney(money(1235n, "JPY"))).toBe("¥1,235");
    expect(formatMoney(money(1234n, "KWD"), { currencyDisplay: "code" })).toMatch(/^KWD\s1\.234$/);
  });

  it("formats amounts beyond Number.MAX_SAFE_INTEGER exactly", () => {
    expect(formatMoney(money(9007199254740993123456n, "USD"))).toBe(
      "$90,071,992,547,409,931,234.56",
    );
  });
});
