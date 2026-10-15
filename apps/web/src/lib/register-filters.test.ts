import { describe, expect, it } from "vitest";
import { registerQuery, registerSearchSchema, searchText } from "./register-filters";
import { DEFAULT_VIEW } from "./register-view";

describe("register filters", () => {
  it("builds the API query from the search and the view, newest first by default", () => {
    expect(registerQuery("a1", { q: "Payee: costco, " }, DEFAULT_VIEW)).toEqual({
      accountId: "a1",
      q: "Payee: costco",
      hideReconciled: "true",
      sort: "date:desc",
    });
    expect(
      registerQuery(
        undefined,
        {},
        {
          ...DEFAULT_VIEW,
          showReconciled: true,
          range: "custom",
          from: "2026-01",
          to: "2026-02",
          sort: [
            { column: "payee", dir: "asc" },
            { column: "date", dir: "desc" },
          ],
        },
      ),
    ).toEqual({ from: "2026-01-01", to: "2026-02-28", sort: "payee:asc,date:desc" });
  });

  it("quotes the search without its trailing comma", () => {
    expect(searchText({ q: "Category: Groceries, " })).toBe("Category: Groceries");
    expect(searchText({})).toBe("");
  });

  it("drops bad values from the address instead of failing", () => {
    expect(registerSearchSchema.parse({ q: "x", sort: "nope", cleared: "maybe" })).toEqual({
      q: "x",
    });
  });
});
