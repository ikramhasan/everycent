import { describe, expect, it } from "vitest";
import { type Budget, pickBudgetRedirect } from "./budgets";

const budget = (id: string, archivedAt: string | null = null) => ({ id, archivedAt }) as Budget;

describe("pickBudgetRedirect", () => {
  it("prefers the last-used budget", () => {
    expect(pickBudgetRedirect({ budgets: [budget("a"), budget("b")], lastUsedBudgetId: "b" })).toBe(
      "b",
    );
  });

  it("falls back to the first budget", () => {
    expect(
      pickBudgetRedirect({ budgets: [budget("a"), budget("b")], lastUsedBudgetId: null }),
    ).toBe("a");
  });

  it("returns null when there are no budgets", () => {
    expect(pickBudgetRedirect({ budgets: [], lastUsedBudgetId: null })).toBeNull();
  });

  it("skips archived budgets when falling back", () => {
    expect(
      pickBudgetRedirect({
        budgets: [budget("old", "2026-10-01T00:00:00.000Z"), budget("new")],
        lastUsedBudgetId: null,
      }),
    ).toBe("new");
  });
});
