import { describe, expect, it } from "vitest";
import { type Budget, pickBudgetRedirect } from "./budgets";

const budget = (id: string) => ({ id }) as Budget;

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
});
