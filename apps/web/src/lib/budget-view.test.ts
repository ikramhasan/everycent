import { describe, expect, it } from "vitest";
import { NO_AUTO_ASSIGN } from "@/test/fixtures";
import {
  availableMark,
  breakdown,
  filteredIds,
  isCaution,
  matchesFilter,
  overspentCount,
  summarize,
  targetMark,
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
  cashOverspent: available.startsWith("-") ? available : "0",
  creditOverspent: "0",
  payment: null,
  target: null,
  autoAssign: NO_AUTO_ASSIGN,
  bar: null,
  underfundedParts: [],
  upcoming: null,
});

const month: BudgetMonthData = {
  month: "2026-10",
  currency: "USD",
  firstMonth: "2026-09",
  lastMonth: "2026-11",
  readyToAssign: "0",
  overdraft: false,
  assignedInFuture: "0",
  futureMonths: [],
  targets: { month: "0", nextMonth: "0", expectedIncome: null },
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
    cashOverspent: "0",
    creditOverspent: "0",
  },
  uncategorized: {
    activity: "-200",
    cashActivity: "-50",
    creditActivity: "-150",
    available: "-200",
    cashOverspent: "-50",
    creditOverspent: "-150",
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

  it("matches underfunded and overfunded by what Auto-Assign would change", () => {
    const auto = (assigned: string, underfunded: string, reduceOverfunding: string) => ({
      available: "0",
      assigned,
      autoAssign: { underfunded, reduceOverfunding },
    });
    expect(matchesFilter("underfunded", auto("1000", "1500", "1000"))).toBe(true);
    expect(matchesFilter("underfunded", auto("1000", "1000", "1000"))).toBe(false);
    expect(matchesFilter("overfunded", auto("1000", "1000", "600"))).toBe(true);
    expect(matchesFilter("overfunded", auto("1000", "1000", "1000"))).toBe(false);
    // Uncategorized has no Auto-Assign: it's underfunded while negative, never overfunded.
    expect(matchesFilter("underfunded", { available: "-200" })).toBe(true);
    expect(matchesFilter("overfunded", { available: "200" })).toBe(false);
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
      cashOverspent: 0n,
      creditOverspent: 0n,
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
      cashOverspent: -2550n,
      creditOverspent: -150n,
    });
  });
});

describe("targets", () => {
  const need = (underfunded: string, funded = "4000") => ({
    available: "4000",
    cashOverspent: "0",
    target: { needed: "10000", funded, underfunded, dueDate: null, snoozed: false },
  });
  it("is yellow while a target is underfunded, unless cash overspending makes it red", () => {
    expect(isCaution(need("6000"), "2026-10", "2026-10")).toBe(true);
    // Snoozed: green or grey instead (support.ynab.com "Snooze a Target").
    const snoozed = need("6000");
    expect(
      isCaution({ ...snoozed, target: { ...snoozed.target, snoozed: true } }, "2026-10", "2026-10"),
    ).toBe(false);
    expect(isCaution(need("0"), "2026-10", "2026-10")).toBe(false);
    expect(
      isCaution(
        { ...need("6000"), available: "-100", cashOverspent: "-100" },
        "2026-10",
        "2026-10",
      ),
    ).toBe(false);
  });
  it("colours a payment category by its target, and red when overpaid", () => {
    const card = (available: string, underfunded: string, target?: string) => ({
      available,
      cashOverspent: "0",
      payment: { underfunded },
      target: target === undefined ? null : { ...need(target).target },
    });
    // No target: yellow while the balance isn't covered (phase 7c).
    expect(isCaution(card("0", "12000"), "2026-10", "2026-10")).toBe(true);
    // Card E1: underfunded target yellow, on track green although the balance isn't covered.
    expect(isCaution(card("0", "12000", "2084"), "2026-10", "2026-10")).toBe(true);
    expect(isCaution(card("5000", "7500", "0"), "2026-10", "2026-10")).toBe(false);
    // Card E2: a payment beyond what was set aside is red, target or not.
    expect(isCaution(card("-1000", "10000", "3334"), "2026-10", "2026-10")).toBe(false);
    expect(isCaution(card("-1000", "10000"), "2026-10", "2026-10")).toBe(false);
  });
  it("marks the pill with the funded share or a check", () => {
    expect(targetMark(need("6000").target)).toEqual({ kind: "underfunded", percent: 40 });
    expect(targetMark(need("0", "15000").target)).toEqual({ kind: "met" });
    expect(targetMark({ ...need("6000").target, snoozed: true })).toEqual({ kind: "snoozed" });
    expect(targetMark(null)).toBeUndefined();
  });
});

describe("isCaution", () => {
  const totals = (available: string, cashOverspent: string) => ({ available, cashOverspent });
  it("is yellow for credit overspending only", () => {
    expect(isCaution(totals("-400", "0"), "2026-10", "2026-10")).toBe(true);
    expect(isCaution(totals("-400", "-100"), "2026-10", "2026-10")).toBe(false);
    expect(isCaution(totals("400", "0"), "2026-10", "2026-10")).toBe(false);
  });

  it("warns on an underfunded payment category from the current month on", () => {
    const payment = (underfunded: string) => ({
      ...totals("100", "0"),
      payment: { underfunded },
    });
    expect(isCaution(payment("200"), "2026-10", "2026-10")).toBe(true);
    expect(isCaution(payment("200"), "2026-11", "2026-10")).toBe(true);
    expect(isCaution(payment("200"), "2026-09", "2026-10")).toBe(false);
    expect(isCaution(payment("0"), "2026-10", "2026-10")).toBe(false);
  });
});

// YNAB, 2026-10-12 ("Onboarding Check", U10 A–I).
describe("upcoming scheduled transactions on the pill", () => {
  const row = (available: string, upcoming: string | null, target?: Record<string, unknown>) => ({
    available,
    cashOverspent: "0",
    upcoming: upcoming === null ? null : { amount: upcoming },
    target: (target ?? null) as never,
  });
  const met = { needed: "4000", funded: "4000", underfunded: "0", snoozed: false };
  const unmet = { needed: "4000", funded: "0", underfunded: "4000", snoozed: false };

  it("shows a yellow calendar while Available doesn't cover them", () => {
    expect(isCaution(row("1000", "-3000"), "2026-10", "2026-10")).toBe(true); // U10 B
    expect(availableMark(row("1000", "-3000"))).toEqual({ kind: "upcoming" });
    expect(isCaution(row("5000", "-3000"), "2026-10", "2026-10")).toBe(false); // U10 H
    expect(availableMark(row("5000", "-3000"))).toBeUndefined();
    expect(availableMark(row("0", "2500"))).toBeUndefined(); // U10 G, an inflow
  });

  it("puts the calendar over a target's mark, but not over a snooze", () => {
    expect(availableMark(row("4000", "-6000", met))).toEqual({ kind: "upcoming" }); // U10 I
    expect(availableMark(row("0", "-3000", unmet))).toEqual({ kind: "upcoming" }); // U10 D
    const snoozed = { ...unmet, snoozed: true };
    expect(availableMark(row("0", "-3000", snoozed))).toEqual({ kind: "snoozed" });
    expect(isCaution(row("0", "-3000", snoozed), "2026-10", "2026-10")).toBe(true);
  });
});
