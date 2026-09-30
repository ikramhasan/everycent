import { describe, expect, it } from "vitest";
import { suggestFormatSettings } from "./suggest-format-settings";

describe("suggestFormatSettings", () => {
  it.each([
    [
      "en-US",
      {
        currency: "USD",
        numberFormat: "comma_dot",
        currencySymbolPosition: "before",
        dateFormat: "MM/DD/YYYY",
      },
    ],
    [
      "en-GB",
      {
        currency: "GBP",
        numberFormat: "comma_dot",
        currencySymbolPosition: "before",
        dateFormat: "DD/MM/YYYY",
      },
    ],
    [
      "de-DE",
      {
        currency: "EUR",
        numberFormat: "dot_comma",
        currencySymbolPosition: "after",
        dateFormat: "DD.MM.YYYY",
      },
    ],
    [
      "fr-FR",
      {
        currency: "EUR",
        numberFormat: "space_comma",
        currencySymbolPosition: "after",
        dateFormat: "DD/MM/YYYY",
      },
    ],
    [
      "de-CH",
      {
        currency: "CHF",
        numberFormat: "apostrophe_dot",
        currencySymbolPosition: "before",
        dateFormat: "DD.MM.YYYY",
      },
    ],
    [
      "en-IN",
      {
        currency: "INR",
        numberFormat: "indian",
        currencySymbolPosition: "before",
        dateFormat: "DD/MM/YYYY",
      },
    ],
    [
      "ja-JP",
      {
        currency: "JPY",
        numberFormat: "comma_dot",
        currencySymbolPosition: "before",
        dateFormat: "YYYY/MM/DD",
      },
    ],
  ] as const)("suggests settings for %s", (locale, expected) => {
    expect(suggestFormatSettings(locale)).toEqual(expected);
  });

  it("uses the region for currency", () => {
    expect(suggestFormatSettings("bn-BD").currency).toBe("BDT");
    expect(suggestFormatSettings("de").currency).toBe("EUR");
  });

  it("falls back to USD for an unknown region", () => {
    expect(suggestFormatSettings("en-AQ").currency).toBe("USD");
  });

  it("falls back to en-US for an invalid tag", () => {
    expect(suggestFormatSettings("not a locale")).toEqual(suggestFormatSettings("en-US"));
  });
});
