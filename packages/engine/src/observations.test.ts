import { describe, expect, it } from "vitest";
import { monthsOfRunway, type ObservationInput, observations } from "./observations";

const base: ObservationInput = {
  month: "2026-10",
  categories: [],
  overspent: [],
  income: new Map(),
  topPayees: [],
  knownPayees: new Set(),
  minimumSpend: 2500n,
};

describe("observations", () => {
  it("notes spending at least 25% above the 6-month average", () => {
    const notes = observations({
      ...base,
      categories: [
        // Average $100: $125 is exactly 25% above.
        { categoryId: "g", name: "Groceries", spent: 12500n, previous: [10000n, 10000n] },
        // $124.99 isn't.
        { categoryId: "d", name: "Dining", spent: 12499n, previous: [10000n] },
        // Above average but under the minimum amount.
        { categoryId: "c", name: "Coffee", spent: 2000n, previous: [500n] },
        // Nothing to compare with.
        { categoryId: "n", name: "New", spent: 90000n, previous: [] },
      ],
    });
    expect(notes).toEqual([
      {
        rule: "category_above_average",
        categoryId: "g",
        name: "Groceries",
        spent: 12500n,
        average: 10000n,
        percentAbove: 25,
      },
    ]);
  });

  it("puts overspent categories first, most overspent first", () => {
    const notes = observations({
      ...base,
      overspent: [
        { categoryId: "a", name: "A", overspent: 100n },
        { categoryId: "b", name: "B", overspent: 900n },
        { categoryId: "z", name: "Z", overspent: 0n },
      ],
      categories: [{ categoryId: "g", name: "Groceries", spent: 30000n, previous: [10000n] }],
    });
    expect(notes.map((n) => n.rule === "category_overspent" && n.categoryId)).toEqual([
      "b",
      "a",
      false,
    ]);
  });

  it("notes a new net worth high in the current month only", () => {
    const worth = [
      { month: "2026-08", netWorth: 500n },
      { month: "2026-09", netWorth: 900n },
      { month: "2026-10", netWorth: 901n },
    ] as const;
    expect(observations({ ...base, netWorth: worth })).toEqual([
      { rule: "net_worth_high", month: "2026-10", netWorth: 901n, previousHigh: 900n },
    ]);
    expect(
      observations({
        ...base,
        netWorth: [...worth.slice(0, 2), { month: "2026-10", netWorth: 900n }],
      }),
    ).toEqual([]);
    expect(observations({ ...base, netWorth: worth.slice(0, 2) })).toEqual([]);
  });

  it("compares complete months' income", () => {
    const income = new Map([
      ["2026-08", 500000n],
      ["2026-09", 450000n],
      ["2026-10", 10n],
    ] as const);
    expect(observations({ ...base, income })).toEqual([
      {
        rule: "income_lower",
        month: "2026-09",
        income: 450000n,
        previousMonth: "2026-08",
        previousIncome: 500000n,
      },
    ]);
    expect(observations({ ...base, income: new Map([["2026-09", 1n]]) })).toEqual([]);
  });

  it("notes new payees among the month's top ten", () => {
    const topPayees = Array.from({ length: 12 }, (_, i) => ({
      payeeId: `p${i}`,
      name: `Payee ${i}`,
      spent: BigInt(1000 - i),
    }));
    const notes = observations({
      ...base,
      topPayees,
      knownPayees: new Set(
        topPayees.map((p) => p.payeeId).filter((id) => id !== "p3" && id !== "p11"),
      ),
    });
    expect(notes).toEqual([
      { rule: "new_top_payee", payeeId: "p3", name: "Payee 3", spent: 997n, rank: 4 },
    ]);
  });

  it("keeps at most two of a rule and five in all", () => {
    const overspent = Array.from({ length: 7 }, (_, i) => ({
      categoryId: `c${i}`,
      name: `C${i}`,
      overspent: BigInt(i + 1),
    }));
    const categories = Array.from({ length: 4 }, (_, i) => ({
      categoryId: `a${i}`,
      name: `A${i}`,
      spent: 90000n,
      previous: [1000n],
    }));
    const topPayees = [{ payeeId: "p", name: "P", spent: 5n }];
    const income = new Map([
      ["2026-08", 2n],
      ["2026-09", 1n],
    ] as const);
    const notes = observations({ ...base, overspent, categories, topPayees, income });
    expect(notes.map((n) => n.rule)).toEqual([
      "category_overspent",
      "category_overspent",
      "category_above_average",
      "category_above_average",
      "income_lower",
    ]);
  });
});

describe("monthsOfRunway", () => {
  it("divides cash by the average monthly spending, to a tenth", () => {
    // $9,000 over an average of $3,000 a month.
    expect(monthsOfRunway(900000n, [200000n, 400000n, 300000n])).toBe(3);
    // $1,000 over an average of $3,000: 0.33 → 0.3.
    expect(monthsOfRunway(100000n, [300000n])).toBe(0.3);
    expect(monthsOfRunway(100000n, [125000n, 125000n])).toBe(0.8);
  });

  it("has no answer without spending", () => {
    expect(monthsOfRunway(100000n, [])).toBeNull();
    expect(monthsOfRunway(100000n, [0n, 0n])).toBeNull();
  });
});
