import { describe, expect, it } from "vitest";
import type { MonthFigures } from "./months";
import { type CategoryTarget, targetNeed, targetPercent } from "./targets";

const target = (behavior: CategoryTarget["behavior"], startMonth = "2026-10"): CategoryTarget => ({
  cadence: "monthly",
  behavior,
  amount: 100_00n,
  dueDay: null,
  startMonth,
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
    expect(need([], setAside)).toEqual({ needed: 100_00n, funded: 0n, underfunded: 100_00n }); // A
    expect(need([f("2026-10", 40_00n)], setAside)?.underfunded).toBe(60_00n); // B
    expect(need([f("2026-10", 100_00n, -30_00n)], setAside)?.underfunded).toBe(0n); // C
    expect(need([f("2026-10", 40_00n, 20_00n)], setAside)?.funded).toBe(40_00n); // D
    expect(need([f("2026-09", 70_00n)], setAside)?.underfunded).toBe(100_00n); // E
    expect(need([f("2026-10", 150_00n)], setAside)).toEqual({
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

describe("targetPercent", () => {
  it("rounds down and stays within 0–100", () => {
    expect(targetPercent({ needed: 100_00n, funded: 40_00n, underfunded: 60_00n })).toBe(40);
    expect(targetPercent({ needed: 100_00n, funded: 99_99n, underfunded: 1n })).toBe(99);
    expect(targetPercent({ needed: 100_00n, funded: 150_00n, underfunded: 0n })).toBe(100);
    expect(targetPercent({ needed: 100_00n, funded: -20_00n, underfunded: 120_00n })).toBe(0);
  });
});
