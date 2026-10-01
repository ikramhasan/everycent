import { describe, expect, it } from "vitest";
import {
  isFiltered,
  nextSort,
  rangeDates,
  registerQuery,
  registerSearchSchema,
} from "./register-filters";

describe("register filters", () => {
  it("turns date ranges into from/to", () => {
    expect(rangeDates({ range: "this_month" }, "2026-10-15")).toEqual({ from: "2026-10-01" });
    expect(rangeDates({ range: "last_3_months" }, "2026-02-10")).toEqual({ from: "2025-12-01" });
    expect(rangeDates({ range: "this_year" }, "2026-10-15")).toEqual({ from: "2026-01-01" });
    expect(rangeDates({ range: "custom", from: "2026-01-05", to: "2026-02-01" })).toEqual({
      from: "2026-01-05",
      to: "2026-02-01",
    });
    expect(rangeDates({})).toEqual({});
  });

  it("builds the API query, newest first by default", () => {
    expect(registerQuery("a1", { q: "  costco ", cleared: "uncleared" })).toEqual({
      accountId: "a1",
      q: "costco",
      cleared: "uncleared",
      sort: "date",
      dir: "desc",
    });
    expect(registerQuery(undefined, { sort: "amount", dir: "asc" })).toEqual({
      sort: "amount",
      dir: "asc",
    });
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
    expect(registerSearchSchema.parse({ cleared: "maybe", q: "x", sort: "nope" })).toEqual({
      q: "x",
    });
    expect(isFiltered({ sort: "amount" })).toBe(false);
    expect(isFiltered({ q: " " })).toBe(false);
    expect(isFiltered({ flag: "red" })).toBe(true);
  });
});
