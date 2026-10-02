import { describe, expect, it } from "vitest";
import { nextSort, registerQuery, registerSearchSchema, searchText } from "./register-filters";
import { DEFAULT_VIEW } from "./register-view";

describe("register filters", () => {
  it("builds the API query from the search and the view, newest first by default", () => {
    expect(registerQuery("a1", { q: "Payee: costco, " }, DEFAULT_VIEW)).toEqual({
      accountId: "a1",
      q: "Payee: costco",
      hideReconciled: "true",
      sort: "date",
      dir: "desc",
    });
    expect(
      registerQuery(
        undefined,
        { sort: "amount", dir: "asc" },
        { ...DEFAULT_VIEW, showReconciled: true, range: "custom", from: "2026-01", to: "2026-02" },
      ),
    ).toEqual({ from: "2026-01-01", to: "2026-02-28", sort: "amount", dir: "asc" });
  });

  it("quotes the search without its trailing comma", () => {
    expect(searchText({ q: "Category: Groceries, " })).toBe("Category: Groceries");
    expect(searchText({})).toBe("");
  });

  it("flips a column's direction and starts new ones in their natural order", () => {
    expect(nextSort({}, "amount")).toEqual({ sort: "amount", dir: "asc" });
    expect(nextSort({ sort: "amount", dir: "asc" }, "amount")).toEqual({
      sort: "amount",
      dir: "desc",
    });
    expect(nextSort({}, "date")).toEqual({ sort: "date", dir: "asc" });
    expect(nextSort({ sort: "date", dir: "asc" }, "date")).toEqual({
      sort: undefined,
      dir: undefined,
    });
  });

  it("drops bad values from the address instead of failing", () => {
    expect(registerSearchSchema.parse({ q: "x", sort: "nope", cleared: "maybe" })).toEqual({
      q: "x",
    });
  });
});
