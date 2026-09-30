import { describe, expect, it } from "vitest";
import { MoneyParseError } from "./errors";
import { formatAmount, parseAmount } from "./format-amount";
import { type BudgetFormatSettings, NUMBER_FORMATS, type NumberFormat } from "./format-settings";
import { money } from "./money";

const NBSP = " ";

function settings(
  numberFormat: NumberFormat,
  currencySymbolPosition: BudgetFormatSettings["currencySymbolPosition"] = "none",
): BudgetFormatSettings {
  return { numberFormat, currencySymbolPosition, dateFormat: "YYYY-MM-DD" };
}

describe("formatAmount", () => {
  it.each([
    ["comma_dot", "1,234,567.89"],
    ["dot_comma", "1.234.567,89"],
    ["space_comma", `1${NBSP}234${NBSP}567,89`],
    ["space_dot", `1${NBSP}234${NBSP}567.89`],
    ["apostrophe_dot", "1'234'567.89"],
    ["indian", "12,34,567.89"],
  ] as const)("formats %s", (format, expected) => {
    expect(formatAmount(money(123456789n, "USD"), settings(format))).toBe(expected);
  });

  it("uses Indian grouping for large amounts", () => {
    expect(formatAmount(money(12345678901n, "INR"), settings("indian"))).toBe("12,34,56,789.01");
  });

  it("does not group short amounts", () => {
    expect(formatAmount(money(99999n, "USD"), settings("comma_dot"))).toBe("999.99");
  });

  it("formats zero and sub-unit amounts", () => {
    expect(formatAmount(money(0n, "USD"), settings("comma_dot"))).toBe("0.00");
    expect(formatAmount(money(-5n, "USD"), settings("comma_dot"))).toBe("-0.05");
  });

  it("follows the currency exponent", () => {
    expect(formatAmount(money(1234567n, "JPY"), settings("comma_dot"))).toBe("1,234,567");
    expect(formatAmount(money(1234567n, "KWD"), settings("comma_dot"))).toBe("1,234.567");
  });

  it("places the symbol", () => {
    const m = money(-123456n, "USD");
    expect(formatAmount(m, settings("comma_dot", "before"))).toBe("-$1,234.56");
    expect(formatAmount(money(-123456n, "EUR"), settings("dot_comma", "after"))).toBe(
      `-1.234,56${NBSP}€`,
    );
    expect(formatAmount(m, settings("comma_dot", "none"))).toBe("-1,234.56");
  });

  it("separates letter symbols from the number", () => {
    expect(formatAmount(money(100n, "CHF"), settings("apostrophe_dot", "before"))).toBe(
      `CHF${NBSP}1.00`,
    );
  });
});

describe("parseAmount", () => {
  it.each(NUMBER_FORMATS)("round-trips formatAmount output for %s", (format) => {
    for (const amount of [0n, 5n, -5n, 123456789n, -123456789n, 12345678901n]) {
      const text = formatAmount(money(amount, "USD"), settings(format));
      expect(parseAmount(text, "USD", format)).toEqual(money(amount, "USD"));
    }
  });

  it("round-trips 0- and 3-decimal currencies", () => {
    for (const currency of ["JPY", "KWD"] as const) {
      const m = money(-1234567n, currency);
      expect(parseAmount(formatAmount(m, settings("dot_comma")), currency, "dot_comma")).toEqual(m);
    }
  });

  it("reads the decimal separator of the format", () => {
    expect(parseAmount("1234,5", "EUR", "dot_comma")).toEqual(money(123450n, "EUR"));
    expect(parseAmount("1 234,5", "EUR", "space_comma")).toEqual(money(123450n, "EUR"));
    expect(parseAmount("1’234.50", "CHF", "apostrophe_dot")).toEqual(money(123450n, "CHF"));
  });

  it("rejects more decimal places than the currency allows", () => {
    expect(() => parseAmount("1,234", "EUR", "dot_comma")).toThrow(MoneyParseError);
    expect(() => parseAmount("1.5", "JPY", "comma_dot")).toThrow(MoneyParseError);
  });
});
