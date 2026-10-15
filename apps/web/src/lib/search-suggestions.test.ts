import { describe, expect, it } from "vitest";
import {
  currentFragment,
  type SuggestionSources,
  searchSuggestions,
  withTerm,
} from "./search-suggestions";

const sources: SuggestionSources = {
  categories: [{ name: "Groceries" }, { name: "Rent/Mortgage" }, { name: "Entertainment" }],
  accounts: [{ name: "Wallet" }],
  flags: [
    { color: "red", name: "" },
    { color: "blue", name: "Reimburse" },
  ],
  settings: {
    currency: "USD",
    numberFormat: "comma_dot",
    currencySymbolPosition: "before",
    dateFormat: "MM/DD/YYYY",
  },
  today: "2026-10-15",
};
const terms = (typed: string, from = sources) => searchSuggestions(typed, from).map((s) => s.term);
const FIND = (t: string) => [t, `Payee: ${t}`, `Category: ${t}`, `Memo: ${t}`];

describe("search suggestions", () => {
  it("suggests matching categories and accounts, then a find in each field", () => {
    expect(terms("ent")).toEqual([
      "Category: Rent/Mortgage",
      "Category: Entertainment",
      ...FIND("ent"),
    ]);
    expect(terms("wal")).toEqual(["Account: Wallet", ...FIND("wal")]);
    expect(terms("")).toEqual([]);
  });

  it("suggests flags and states by name", () => {
    expect(terms("red")).toEqual([
      "Flag: Red",
      "Is: Uncleared",
      "Is: Cleared",
      "Is: Cleared or Reconciled",
      ...FIND("red"),
    ]);
    expect(terms("reimb")).toEqual(["Flag: Reimburse", ...FIND("reimb")]);
  });

  it("lists every option of a label typed", () => {
    expect(terms("is:").slice(0, 5)).toEqual([
      "Is: Uncleared",
      "Is: Cleared",
      "Is: Reconciled",
      "Is: Unreconciled",
      "Is: Cleared or Reconciled",
    ]);
    expect(terms("flag").slice(0, 3)).toEqual(["Flag: None", "Flag: Red", "Flag: Reimburse"]);
  });

  it("reads amounts and dates", () => {
    expect(searchSuggestions("25", sources).slice(1, 4)).toEqual([
      { label: "Outflow:", text: "Outflow equals $25.00", term: "Outflow: 25" },
      { label: "Outflow:", text: "Outflow more or equal to $25.00", term: "Outflow: >=25" },
      { label: "Outflow:", text: "Outflow less or equal to $25.00", term: "Outflow: <=25" },
    ]);
    expect(terms("10/02/2026").slice(0, 3)).toEqual([
      "On: 10/02/2026",
      "Before: 10/02/2026",
      "After: 10/02/2026",
    ]);
  });

  it("offers Income: for this month after a start of 'income' or a digit", () => {
    const income = {
      label: "Income:",
      text: "Enter month like 'Income: October 2026'",
      term: "Income: October 2026",
      calendar: true,
    };
    for (const typed of ["i", "inco", "income", "Income:", "income: ", "5", "2026"]) {
      expect(searchSuggestions(typed, sources)[0], typed).toEqual(income);
    }
    // After the date options, before the amounts.
    expect(terms("10/02/2026").slice(0, 4)).toEqual([
      "On: 10/02/2026",
      "Before: 10/02/2026",
      "After: 10/02/2026",
      "Income: October 2026",
    ]);
    for (const typed of ["oct", "October", "income: o", "ix"]) {
      expect(terms(typed), typed).not.toContain("Income: October 2026");
    }
    expect(terms("i", { ...sources, today: "2027-01-03" })[0]).toBe("Income: January 2027");
  });

  it("replaces what's being typed with the picked term", () => {
    expect(currentFragment("Payee: sto, gro")).toBe("gro");
    expect(withTerm("Payee: sto, gro", "Category: Groceries")).toBe(
      "Payee: sto, Category: Groceries, ",
    );
    expect(withTerm("gro", "Category: Groceries")).toBe("Category: Groceries, ");
  });
});
