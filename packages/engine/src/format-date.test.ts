import { describe, expect, it } from "vitest";
import { formatDate } from "./format-date";

describe("formatDate", () => {
  it.each([
    ["MM/DD/YYYY", "10/01/2026"],
    ["DD/MM/YYYY", "01/10/2026"],
    ["YYYY-MM-DD", "2026-10-01"],
    ["DD.MM.YYYY", "01.10.2026"],
    ["YYYY/MM/DD", "2026/10/01"],
    ["DD-MM-YYYY", "01-10-2026"],
  ] as const)("formats %s", (format, expected) => {
    expect(formatDate("2026-10-01", format)).toBe(expected);
  });

  it("rejects anything that is not a YYYY-MM-DD date", () => {
    expect(() => formatDate("2026-10-01T00:00:00Z", "YYYY-MM-DD")).toThrow(RangeError);
    expect(() => formatDate("10/01/2026", "YYYY-MM-DD")).toThrow(RangeError);
  });
});
