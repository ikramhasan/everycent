import { describe, expect, it } from "vitest";
import { ageOfMoneySearchSchema, changeLabel, daysLabel, spanMonths } from "./age-of-money";

const months = [
  { month: "2024-09", days: 3 },
  { month: "2025-10", days: 8 },
  { month: "2025-11", days: null },
  { month: "2026-05", days: 12 },
  { month: "2026-06", days: null },
  { month: "2026-10", days: 14 },
];

describe("spanMonths", () => {
  it("keeps the span's months ending this month, without months that have no value", () => {
    expect(spanMonths(months, "6m").map((m) => m.month)).toEqual(["2026-05", "2026-10"]);
    expect(spanMonths(months, "1y").map((m) => m.month)).toEqual(["2026-05", "2026-10"]);
    expect(spanMonths(months, "2y").map((m) => m.month)).toEqual(["2025-10", "2026-05", "2026-10"]);
  });

  it("keeps months without a value for the table", () => {
    expect(spanMonths(months, "6m", { all: true }).map((m) => m.month)).toEqual([
      "2026-05",
      "2026-06",
      "2026-10",
    ]);
  });

  it("is empty without months", () => {
    expect(spanMonths([], "1y")).toEqual([]);
  });
});

describe("changeLabel", () => {
  it("says how the number moved over 30 days", () => {
    expect(changeLabel(14, 11)).toBe("Up 3 days from 30 days ago");
    expect(changeLabel(14, 15)).toBe("Down 1 day from 30 days ago");
    expect(changeLabel(14, 14)).toBe("Same as 30 days ago");
    expect(changeLabel(14, null)).toBeNull();
    expect(changeLabel(null, 3)).toBeNull();
  });
});

describe("age of money search", () => {
  it("reads the span and drops one it doesn't know", () => {
    expect(ageOfMoneySearchSchema.parse({ span: "2y", view: "table" })).toEqual({
      span: "2y",
      view: "table",
    });
    expect(ageOfMoneySearchSchema.parse({ span: "5y" })).toEqual({});
  });

  it("writes days", () => {
    expect(daysLabel(1)).toBe("1 day");
    expect(daysLabel(0)).toBe("0 days");
  });
});
