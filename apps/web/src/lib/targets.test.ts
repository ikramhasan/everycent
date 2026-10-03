import { describe, expect, it } from "vitest";
import { dueDayIn, ordinal, targetDueLine, targetHeading, targetRowNote } from "./targets";

const format = (minor: string) => `$${(Number(minor) / 100).toFixed(2)}`;

describe("target wording", () => {
  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "31st",
    ]);
  });

  it("falls due on the last day by default", () => {
    expect(dueDayIn(null, "2026-10")).toBe(31);
    expect(dueDayIn(null, "2026-11")).toBe(30);
    expect(dueDayIn(15, "2026-11")).toBe(15);
    expect(dueDayIn(31, "2026-02")).toBe(28);
  });

  it("matches YNAB's inspector headings", () => {
    expect(targetHeading({ behavior: "set_aside" }, "$100.00")).toBe(
      "Set Aside Another $100.00 Each Month",
    );
    expect(targetHeading({ behavior: "refill" }, "$100.00")).toBe(
      "Refill Up to $100.00 Each Month",
    );
    expect(targetDueLine(null)).toBe("By the End of the Month");
    expect(targetDueLine(15)).toBe("By the 15th of the Month");
  });

  it("matches YNAB's row notes (T8 B, F, G, C)", () => {
    const note = (behavior: "set_aside" | "refill", funded: string, underfunded: string) =>
      targetRowNote(
        { behavior, dueDay: null },
        { needed: "10000", funded, underfunded },
        "2026-10",
        format,
      ).text;
    expect(note("set_aside", "4000", "6000")).toBe("$60.00 more needed by the 31st");
    expect(note("set_aside", "0", "10000")).toBe("$100.00 more needed by the 31st");
    expect(note("refill", "0", "10000")).toBe("$100.00 needed by the 31st");
    expect(note("refill", "7000", "3000")).toBe("$30.00 more needed by the 31st");
    expect(note("set_aside", "10000", "0")).toBe("Funded");
  });
});
