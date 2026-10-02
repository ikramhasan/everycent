import { describe, expect, it } from "vitest";
import {
  addMonths,
  budgetMonthRange,
  categoryMonth,
  categoryOverspending,
  monthBounds,
  monthOf,
  readyToAssign,
} from "./months";

describe("month helpers", () => {
  it("moves across years", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-10", -22)).toBe("2024-12");
    expect(addMonths("2026-10", 0)).toBe("2026-10");
  });

  it("knows month bounds, leap years included", () => {
    expect(monthBounds("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(monthBounds("2026-02").end).toBe("2026-02-28");
    expect(monthBounds("2026-12").end).toBe("2026-12-31");
    expect(monthOf("2026-10-02")).toBe("2026-10");
  });
});

describe("budgetMonthRange", () => {
  it("runs from the month before the oldest transaction to the month after the current one", () => {
    expect(
      budgetMonthRange({
        current: "2026-10",
        earliestTransaction: "2026-08",
        latestAssigned: null,
      }),
    ).toEqual({ first: "2026-07", last: "2026-11" });
  });

  it("opens the month after the latest month with money assigned", () => {
    expect(
      budgetMonthRange({
        current: "2026-10",
        earliestTransaction: "2026-10",
        latestAssigned: "2026-11",
      }),
    ).toEqual({ first: "2026-09", last: "2026-12" });
  });

  it("starts the month before the current one without transactions", () => {
    expect(
      budgetMonthRange({ current: "2026-10", earliestTransaction: null, latestAssigned: null }),
    ).toEqual({ first: "2026-09", last: "2026-11" });
  });
});

describe("categoryMonth", () => {
  const m = (month: string, assigned: bigint, activity: bigint) => ({ month, assigned, activity });

  it("is all zero without history", () => {
    expect(categoryMonth([], "2026-10")).toEqual({
      carried: 0n,
      assigned: 0n,
      activity: 0n,
      available: 0n,
    });
  });

  it("rolls what's left into the following months", () => {
    const history = [m("2026-08", 10000n, -2500n), m("2026-10", 500n, -1000n)];
    expect(categoryMonth(history, "2026-09")).toEqual({
      carried: 7500n,
      assigned: 0n,
      activity: 0n,
      available: 7500n,
    });
    expect(categoryMonth(history, "2026-10")).toEqual({
      carried: 7500n,
      assigned: 500n,
      activity: -1000n,
      available: 7000n,
    });
    expect(categoryMonth(history, "2026-12").available).toBe(7000n);
  });

  it("starts the month after overspending at zero", () => {
    const history = [m("2026-10", 0n, -2500n)];
    expect(categoryMonth(history, "2026-10").available).toBe(-2500n);
    expect(categoryMonth(history, "2026-11")).toEqual({
      carried: 0n,
      assigned: 0n,
      activity: 0n,
      available: 0n,
    });
    const later = [...history, m("2026-12", 1000n, -200n)];
    expect(categoryMonth(later, "2026-12")).toEqual({
      carried: 0n,
      assigned: 1000n,
      activity: -200n,
      available: 800n,
    });
  });

  it("adds up several entries for the same month, in any order", () => {
    const history = [m("2026-10", 0n, -300n), m("2026-09", 1000n, 0n), m("2026-10", 200n, -100n)];
    expect(categoryMonth(history, "2026-10")).toEqual({
      carried: 1000n,
      assigned: 200n,
      activity: -400n,
      available: 800n,
    });
  });

  it("ignores later months", () => {
    expect(categoryMonth([m("2026-11", 5000n, 0n)], "2026-10").available).toBe(0n);
  });
});

describe("readyToAssign", () => {
  const a = (month: string, amount: bigint) => ({ month, amount });

  // The YNAB test budget: $12,100 of income in October, $3 overspent in August, $32 in October.
  const income = [a("2026-10", 1210000n)];
  const overspent = [a("2026-08", -300n), a("2026-10", -3200n)];

  it("subtracts assigned money and earlier months' overspending", () => {
    const assigned = [a("2026-10", 5000n)];
    expect(readyToAssign({ month: "2026-10", income, assigned, overspent })).toEqual({
      readyToAssign: 1204700n,
      assignedInFuture: 0n,
    });
    // November also loses October's overspending.
    expect(readyToAssign({ month: "2026-11", income, assigned, overspent }).readyToAssign).toBe(
      1201500n,
    );
  });

  it("takes money assigned in later months from what's left", () => {
    const assigned = [a("2026-10", 5000n), a("2026-11", 2000n)];
    expect(readyToAssign({ month: "2026-10", income, assigned, overspent })).toEqual({
      readyToAssign: 1202700n,
      assignedInFuture: 2000n,
    });
    expect(readyToAssign({ month: "2026-11", income, assigned, overspent }).readyToAssign).toBe(
      1199500n,
    );
  });

  it("never lets later months push a month below zero", () => {
    const assigned = [a("2026-10", 5000n), a("2026-11", 1300000n)];
    expect(readyToAssign({ month: "2026-10", income, assigned, overspent }).readyToAssign).toBe(0n);
    expect(readyToAssign({ month: "2026-11", income, assigned, overspent }).readyToAssign).toBe(
      -98500n,
    );
    // September has no income: only August's overspending counts.
    expect(readyToAssign({ month: "2026-09", income, assigned, overspent })).toEqual({
      readyToAssign: -300n,
      assignedInFuture: 1305000n,
    });
  });
});

describe("categoryOverspending", () => {
  it("lists the months a category ended below zero", () => {
    const history = [
      { month: "2026-08", assigned: 0n, activity: -300n },
      { month: "2026-09", assigned: 1000n, activity: -200n },
      { month: "2026-10", assigned: 0n, activity: -1000n },
    ];
    expect(categoryOverspending(history)).toEqual([
      { month: "2026-08", amount: -300n },
      { month: "2026-10", amount: -200n },
    ]);
  });
});
