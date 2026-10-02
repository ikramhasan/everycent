import { describe, expect, it } from "vitest";
import { NO_AUTO_ASSIGN } from "@/test/fixtures";
import {
  breakdown,
  filteredIds,
  matchesFilter,
  overspentCount,
  summarize,
  UNCATEGORIZED,
} from "./budget-view";
import type { BudgetMonthData } from "./months";

const cat = (categoryId: string, assigned: string, activity: string, available: string) => ({
  categoryId,
  assigned,
  activity,
  cashActivity: activity,
  creditActivity: "0",
  available,
  autoAssign: NO_AUTO_ASSIGN,
});

const month: BudgetMonthData = {
  month: "2026-10",
  currency: "USD",
  firstMonth: "2026-09",
  lastMonth: "2026-11",
  readyToAssign: "0",
  assignedInFuture: "0",
  futureMonths: [],
  categories: [
    cat("rent", "4000", "0", "4000"),
    cat("power", "0", "-2500", "-2500"),
    cat("food", "1000", "-500", "1500"),
    cat("hidden", "300", "0", "300"),
    cat("zero", "0", "0", "0"),
  ],
  groups: [],
  hidden: {
    assigned: "300",
    activity: "0",
    cashActivity: "0",
    creditActivity: "0",
    available: "300",
  },
  uncategorized: {
    activity: "-200",
    cashActivity: "-50",
    creditActivity: "-150",
    available: "-200",
  },
};
const visible = new Set(["rent", "power", "food", "zero"]);

describe("budget views", () => {
  it("matches overspent and money available by the sign of Available", () => {
    expect(matchesFilter("overspent", { available: "-1" })).toBe(true);
    expect(matchesFilter("overspent", { available: "0" })).toBe(false);
    expect(matchesFilter("available", { available: "1" })).toBe(true);
    expect(matchesFilter("available", { available: "0" })).toBe(false);
    expect(matchesFilter("all", { available: "0" })).toBe(true);
  });

  it("leaves hidden categories out and counts Uncategorized", () => {
    expect([...filteredIds("overspent", month, visible)]).toEqual(["power", UNCATEGORIZED]);
    expect([...filteredIds("available", month, visible)]).toEqual(["rent", "food"]);
    expect(overspentCount(month, visible)).toBe(2);
  });

  it("works out what a category carried in", () => {
    expect(breakdown(cat("food", "1000", "-500", "1500"))).toEqual({
      carried: 1000n,
      assigned: 1000n,
      activity: -500n,
      cashActivity: -500n,
      creditActivity: 0n,
      available: 1500n,
    });
  });

  it("adds up the summary over the given rows", () => {
    expect(summarize(month, ["rent", "power", UNCATEGORIZED])).toEqual({
      carried: 0n,
      assigned: 4000n,
      activity: -2700n,
      cashActivity: -2550n,
      creditActivity: -150n,
      available: 1300n,
    });
  });
});
