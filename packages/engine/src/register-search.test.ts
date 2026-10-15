import { describe, expect, it } from "vitest";
import { incomeTerm, parseDate, parseSearch, type SearchSettings } from "./register-search";

const settings: SearchSettings = {
  currency: "USD",
  numberFormat: "comma_dot",
  dateFormat: "MM/DD/YYYY",
};

describe("parseSearch", () => {
  it("reads the terms the suggestions write, comma separated", () => {
    expect(parseSearch("Payee: sto, Is: Cleared, Outflow: >=25,", settings)).toEqual([
      { kind: "payee", text: "sto" },
      { kind: "is", state: "cleared" },
      { kind: "amount", direction: "outflow", op: "gte", amount: 2500n },
    ]);
  });

  it("reads free text, with the amount a number stands for", () => {
    expect(parseSearch("ent,", settings)).toEqual([{ kind: "text", text: "ent", amount: null }]);
    expect(parseSearch("5", settings)).toEqual([{ kind: "text", text: "5", amount: 500n }]);
  });

  it("reads every labelled term, ignoring the label's case", () => {
    expect(
      parseSearch(
        "category: Split, Category: 🛒 Groceries, memo: rent, Account: Wallet, Flag: Red, " +
          "is: cleared or reconciled, Inflow: <=1000.50, Outflow: 25, On: 10/02/2026, " +
          "Before: 1/2/2026, After: 12/31/2025",
        settings,
      ),
    ).toEqual([
      { kind: "split" },
      { kind: "category", text: "🛒 Groceries" },
      { kind: "memo", text: "rent" },
      { kind: "account", text: "Wallet" },
      { kind: "flag", text: "Red" },
      { kind: "is", state: "cleared_or_reconciled" },
      { kind: "amount", direction: "inflow", op: "lte", amount: 100050n },
      { kind: "amount", direction: "outflow", op: "eq", amount: 2500n },
      { kind: "date", op: "on", date: "2026-10-02" },
      { kind: "date", op: "before", date: "2026-01-02" },
      { kind: "date", op: "after", date: "2025-12-31" },
    ]);
  });

  it("reads Income: as a month name, in full or three letters, with an optional year", () => {
    // The forms that matched October in YNAB (2026-10-15, EVERYCENT-114).
    expect(
      parseSearch(
        "Income: October 2026, income: oct 2026, INCOME: OCTOBER 2026, Income: Oct, Income: may",
        settings,
      ),
    ).toEqual([
      { kind: "income", month: 10, year: 2026 },
      { kind: "income", month: 10, year: 2026 },
      { kind: "income", month: 10, year: 2026 },
      { kind: "income", month: 10, year: null },
      { kind: "income", month: 5, year: null },
    ]);
    // And the ones that matched nothing.
    expect(parseSearch("Income: 10/2026, Income: 2026-10, Income: sept 2026", settings)).toEqual([
      { kind: "text", text: "Income: 10/2026", amount: null },
      { kind: "text", text: "Income: 2026-10", amount: null },
      { kind: "text", text: "Income: sept 2026", amount: null },
    ]);
    expect(incomeTerm(10, 2026)).toBe("Income: October 2026");
  });

  it("searches a term it can't read as free text", () => {
    expect(parseSearch("Is: sideways, Outflow: lots, Colour: red, is:", settings)).toEqual([
      { kind: "text", text: "Is: sideways", amount: null },
      { kind: "text", text: "Outflow: lots", amount: null },
      { kind: "text", text: "Colour: red", amount: null },
      { kind: "text", text: "is:", amount: null },
    ]);
  });
});

describe("parseDate", () => {
  it("reads a full date in the budget's format", () => {
    expect(parseDate("02/10/2026", "DD/MM/YYYY")).toBe("2026-10-02");
    expect(parseDate("2026-10-02", "YYYY-MM-DD")).toBe("2026-10-02");
    expect(parseDate("2.10.2026", "DD.MM.YYYY")).toBe("2026-10-02");
  });

  it("rejects dates that don't exist or aren't complete", () => {
    expect(parseDate("02/30/2026", "MM/DD/YYYY")).toBeNull();
    expect(parseDate("10/02", "MM/DD/YYYY")).toBeNull();
    expect(parseDate("10/02/26", "MM/DD/YYYY")).toBeNull();
  });
});
