import { describe, expect, it } from "vitest";
import { checkChart } from "./chart";

const spending = {
  type: "bar",
  title: "Spending by category",
  valueFormat: "money",
  data: [
    { label: "Rent", spent: 140000 },
    { label: "Groceries", spent: 29247 },
  ],
  series: [{ key: "spent", label: "Spent" }],
};

describe("checkChart", () => {
  it("accepts every kind of chart the app draws", () => {
    for (const type of ["bar", "line", "area", "pie", "radar", "radial"]) {
      expect(checkChart({ ...spending, type }), type).toEqual({ shown: true });
    }
    expect(
      checkChart({
        ...spending,
        type: "line",
        data: [
          { label: "Sep", income: 320000, expenses: 250000 },
          { label: "Oct", income: 320000, expenses: 204046 },
        ],
        series: [
          { key: "income", label: "Income" },
          { key: "expenses", label: "Expenses" },
        ],
      }),
    ).toEqual({ shown: true });
  });

  it("says what to fix, so the model can try again", () => {
    expect(checkChart({ ...spending, type: "histogram" })).toEqual({
      error: "type must be one of bar, line, area, pie, radar, radial",
    });
    expect(checkChart({ ...spending, data: [] })).toEqual({ error: "data needs at least one row" });
    expect(checkChart({ ...spending, data: [{ label: "Rent", spent: "1400" }] })).toEqual({
      error: 'Row 1 ("Rent") needs a number for "spent"',
    });
    expect(
      checkChart({
        ...spending,
        type: "pie",
        series: [
          { key: "spent", label: "Spent" },
          { key: "budgeted", label: "Budgeted" },
        ],
      }),
    ).toEqual({ error: "A pie chart shows exactly one series" });
    expect(checkChart({ ...spending, series: [{ key: "label", label: "Label" }] })).toEqual({
      error: 'Every series needs a string key other than "label"',
    });
  });
});
