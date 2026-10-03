import { describe, expect, it } from "vitest";
import type { MonthFigures } from "./months";
import { type CategoryTarget, targetNeed, targetPercent, weekdaysIn } from "./targets";

const target = (
  behavior: CategoryTarget["behavior"],
  startMonth = "2026-10",
  extra: Partial<CategoryTarget> = {},
): CategoryTarget => ({
  cadence: "monthly",
  behavior,
  amount: 100_00n,
  dueDay: null,
  dueDate: null,
  repeatEvery: null,
  repeatUnit: null,
  startMonth,
  ...extra,
});
const f = (month: string, assigned: bigint, activity = 0n): MonthFigures => ({
  month,
  assigned,
  activity,
});
const need = (h: MonthFigures[], t: CategoryTarget, month = "2026-10") =>
  targetNeed(h, t, month, "2026-10");

// Each case is one of the YNAB test categories in docs/verify.md ("Monthly targets").
describe("targetNeed", () => {
  it("set aside counts only this month's Assigned", () => {
    const setAside = target("set_aside");
    expect(need([], setAside)).toEqual({
      needed: 100_00n,
      funded: 0n,
      underfunded: 100_00n,
      dueDate: null,
    }); // A
    expect(need([f("2026-10", 40_00n)], setAside)?.underfunded).toBe(60_00n); // B
    expect(need([f("2026-10", 100_00n, -30_00n)], setAside)?.underfunded).toBe(0n); // C
    expect(need([f("2026-10", 40_00n, 20_00n)], setAside)?.funded).toBe(40_00n); // D
    expect(need([f("2026-09", 70_00n)], setAside)?.underfunded).toBe(100_00n); // E
    expect(need([f("2026-10", 150_00n)], setAside)).toMatchObject({
      needed: 100_00n,
      funded: 150_00n,
      underfunded: 0n,
    }); // L
    expect(need([f("2026-09", 150_00n), f("2026-10", 50_00n)], setAside)?.underfunded).toBe(50_00n); // N
  });

  it("refill counts what was carried in plus this month's Assigned", () => {
    const refill = target("refill");
    expect(need([], refill)?.underfunded).toBe(100_00n); // F
    expect(need([f("2026-09", 70_00n)], refill)?.underfunded).toBe(30_00n); // G
    expect(need([f("2026-09", 70_00n), f("2026-10", 0n, -20_00n)], refill)?.funded).toBe(70_00n); // H
    expect(need([f("2026-10", 100_00n, -30_00n)], refill)?.underfunded).toBe(0n); // I
    expect(need([f("2026-10", 40_00n, 20_00n)], refill)?.underfunded).toBe(60_00n); // J
    expect(need([f("2026-09", 70_00n, -20_00n)], refill)?.underfunded).toBe(50_00n); // K
    expect(need([f("2026-09", 70_00n), f("2026-10", -20_00n)], refill)?.underfunded).toBe(50_00n); // M
  });

  it("ignores carried money in a future month, for refill too", () => {
    const history = [f("2026-09", 70_00n)];
    expect(need(history, target("refill"), "2026-11")?.funded).toBe(0n);
    expect(need([...history, f("2026-11", 30_00n)], target("refill"), "2026-11")?.funded).toBe(
      30_00n,
    );
  });

  it("asks for nothing before the start month", () => {
    expect(need([f("2026-09", 70_00n)], target("refill"), "2026-09")).toBeNull();
    expect(need([f("2026-09", 70_00n)], target("refill", "2026-09"), "2026-09")?.funded).toBe(
      70_00n,
    );
  });
});

describe("weekly targets (YNAB T8 A, $10 on Saturdays)", () => {
  it("counts the weekday's occurrences", () => {
    expect(weekdaysIn("2026-10", 6)).toBe(5);
    expect(weekdaysIn("2026-11", 6)).toBe(4);
    expect(weekdaysIn("2026-02", 0)).toBe(4);
    expect(weekdaysIn("2024-02", 4)).toBe(5);
  });
  it("asks the weekly amount once per occurrence", () => {
    const weekly = target("set_aside", "2026-10", { cadence: "weekly", amount: 10_00n, dueDay: 6 });
    expect(need([], weekly)?.needed).toBe(50_00n);
    expect(need([], weekly, "2026-11")?.needed).toBe(40_00n);
    expect(need([f("2026-10", 20_00n)], weekly)?.underfunded).toBe(30_00n);
  });
});

describe("dated targets", () => {
  // T8 F: yearly set aside $1,000 by Dec 30 2026.
  const yearly = target("set_aside", "2026-10", {
    cadence: "yearly",
    amount: 1000_00n,
    dueDate: "2026-12-30",
  });
  it("spreads what's missing over the months left, rounding up", () => {
    expect(need([], yearly)).toEqual({
      needed: 1000_00n,
      funded: 0n,
      underfunded: 333_34n,
      dueDate: "2026-12-30",
    });
    expect(need([], yearly, "2026-11")?.underfunded).toBe(500_00n);
    expect(need([], yearly, "2026-12")?.underfunded).toBe(1000_00n);
    const paid = [f("2026-10", 333_34n)];
    expect(need(paid, yearly)).toMatchObject({ funded: 333_34n, underfunded: 0n });
    expect(need(paid, yearly, "2026-11")).toMatchObject({ funded: 333_34n, underfunded: 333_33n });
    expect(need(paid, yearly, "2026-12")?.underfunded).toBe(666_66n);
  });

  it("starts a new period the month after the due month (T8 A, T8 G)", () => {
    const everyTwo = target("set_aside", "2026-10", {
      cadence: "custom",
      amount: 300_00n,
      dueDate: "2026-11-01",
      repeatEvery: 2,
      repeatUnit: "month",
    });
    expect(need([], everyTwo)?.underfunded).toBe(150_00n);
    expect(need([f("2026-10", 150_00n), f("2026-11", 150_00n)], everyTwo, "2026-12")).toEqual({
      needed: 300_00n,
      funded: 0n,
      underfunded: 150_00n,
      dueDate: "2027-01-01",
    });
    const refill = target("refill", "2026-10", {
      cadence: "yearly",
      amount: 1000_00n,
      dueDate: "2026-11-01",
    });
    const carried = [f("2026-09", 70_00n)];
    expect(need(carried, refill)).toEqual({
      needed: 1000_00n,
      funded: 70_00n,
      underfunded: 465_00n,
      dueDate: "2026-11-01",
    });
    // December is a future month: carried money doesn't count yet; 12 months to next November.
    expect(need(carried, refill, "2026-12")).toMatchObject({
      underfunded: 83_34n,
      dueDate: "2027-11-01",
    });
  });

  it("stops asking after a one-time target's due month", () => {
    const once = target("set_aside", "2026-10", {
      cadence: "custom",
      amount: 300_00n,
      dueDate: "2026-11-30",
    });
    expect(need([], once)?.underfunded).toBe(150_00n);
    expect(need([], once, "2026-12")).toBeNull();
  });

  it("balance targets ask only with a date", () => {
    const eventually = target("balance", "2026-10", { cadence: "custom", amount: 300_00n });
    expect(need([], eventually)).toEqual({
      needed: 300_00n,
      funded: 0n,
      underfunded: 0n,
      dueDate: null,
    });
    const byDec = { ...eventually, dueDate: "2026-12-01" };
    expect(need([], byDec)?.underfunded).toBe(100_00n);
    expect(need([f("2026-10", 100_00n)], byDec)).toMatchObject({
      funded: 100_00n,
      underfunded: 0n,
    });
  });
});

describe("targetPercent", () => {
  it("rounds down and stays within 0–100", () => {
    expect(targetPercent({ needed: 100_00n, funded: 40_00n })).toBe(40);
    expect(targetPercent({ needed: 100_00n, funded: 99_99n })).toBe(99);
    expect(targetPercent({ needed: 100_00n, funded: 150_00n })).toBe(100);
    expect(targetPercent({ needed: 100_00n, funded: -20_00n })).toBe(0);
    // On track for a yearly target: a third of the total (YNAB showed 33%).
    expect(targetPercent({ needed: 1000_00n, funded: 333_34n })).toBe(33);
  });
});
