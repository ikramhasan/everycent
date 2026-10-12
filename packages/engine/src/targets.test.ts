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
    expect(need([], setAside)).toMatchObject({
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
  // YNAB C5 W1–W3 (plan "C4 Clean", 2026-10-12): a weekly refill fills the month's occurrences.
  it("refills the month's occurrences, counting what was carried in", () => {
    const weekly = target("refill", "2026-10", { cadence: "weekly", amount: 10_00n, dueDay: 6 });
    expect(need([], weekly)?.underfunded).toBe(50_00n); // W1
    expect(need([], weekly, "2026-11")?.underfunded).toBe(40_00n);
    expect(need([f("2026-09", 15_00n)], weekly)).toMatchObject({
      funded: 15_00n,
      underfunded: 35_00n,
    }); // W2
    expect(need([f("2026-10", 25_00n, -15_00n)], weekly)?.underfunded).toBe(25_00n); // W3
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
    expect(need([], yearly)).toMatchObject({
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
    expect(need([f("2026-10", 150_00n), f("2026-11", 150_00n)], everyTwo, "2026-12")).toMatchObject(
      {
        needed: 300_00n,
        funded: 0n,
        underfunded: 150_00n,
        dueDate: "2027-01-01",
      },
    );
    const refill = target("refill", "2026-10", {
      cadence: "yearly",
      amount: 1000_00n,
      dueDate: "2026-11-01",
    });
    const carried = [f("2026-09", 70_00n)];
    expect(need(carried, refill)).toMatchObject({
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
    expect(need([], eventually)).toMatchObject({
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

  // YNAB C5 D1–D3 (plan "C4 Clean", 2026-10-12): refill $1,200 by March 2027, $300 carried in.
  it("refill counts what was carried in, not this month's spending", () => {
    const refill = target("refill", "2026-10", {
      cadence: "custom",
      amount: 1200_00n,
      dueDate: "2027-03-31",
    });
    expect(need([f("2026-09", 300_00n)], refill)?.underfunded).toBe(150_00n); // D2
    expect(need([f("2026-09", 300_00n), f("2026-10", 0n, -120_00n)], refill)).toMatchObject({
      funded: 300_00n,
      underfunded: 150_00n,
    }); // D1
    expect(need([f("2026-09", 300_00n, -120_00n)], refill)?.underfunded).toBe(170_00n); // D3
  });
});

// YNAB's test categories O1–O10 and T8 F/L in docs/verify.md ("Underfunded and Reduce
// Overfunding"), checked on 2026-10-07.
describe("what's over and the month's targets", () => {
  const carried = (amount: bigint) => f("2026-09", amount);
  it("takes back Assigned above the month's amount, up to what's Available", () => {
    expect(need([f("2026-10", 150_00n)], target("set_aside"))?.overfunded).toBe(50_00n); // T8 L
    expect(need([f("2026-10", 150_00n, -120_00n)], target("set_aside"))?.overfunded).toBe(30_00n); // O1
    expect(need([carried(100_00n), f("2026-10", 150_00n)], target("set_aside"))?.overfunded).toBe(
      50_00n,
    ); // O9
    expect(need([f("2026-10", 150_00n)], target("refill"))?.overfunded).toBe(50_00n); // O2
    expect(need([f("2026-10", 150_00n, -120_00n)], target("refill"))?.overfunded).toBe(30_00n); // O8
  });

  it("counts carried money for refill, so Assigned can go below zero", () => {
    expect(need([carried(80_00n), f("2026-10", 50_00n)], target("refill"))?.overfunded).toBe(
      30_00n,
    ); // O3
    expect(need([carried(150_00n)], target("refill"))?.overfunded).toBe(50_00n); // O4
    // In a future month carried money doesn't count, so nothing is over (O4 in November).
    expect(need([carried(150_00n)], target("refill"), "2026-11")?.overfunded).toBe(0n);
  });

  it("weekly and dated targets compare against this month's amount", () => {
    const weekly = target("set_aside", "2026-10", { cadence: "weekly", amount: 10_00n, dueDay: 6 });
    expect(need([f("2026-10", 70_00n)], weekly)?.overfunded).toBe(20_00n); // O6
    const byDec = target("set_aside", "2026-10", {
      cadence: "custom",
      amount: 100_00n,
      dueDate: "2026-12-31",
    });
    expect(need([f("2026-10", 100_00n)], byDec)).toMatchObject({
      monthAmount: 33_34n,
      overfunded: 66_66n,
    }); // O10
    const yearly = target("set_aside", "2026-10", {
      cadence: "yearly",
      amount: 1000_00n,
      dueDate: "2026-12-30",
    });
    expect(need([f("2026-10", 333_34n)], yearly)?.overfunded).toBe(0n); // T8 F
  });

  it("asks the month's full amount, or this month's share of a dated target", () => {
    // Monthly refill counts in full in the month's targets even with money carried in (T8 H).
    expect(need([carried(70_00n)], target("refill"))?.monthAmount).toBe(100_00n);
    const refill = target("refill", "2026-10", {
      cadence: "yearly",
      amount: 1000_00n,
      dueDate: "2026-11-01",
    });
    expect(need([carried(70_00n)], refill)?.monthAmount).toBe(465_00n); // T8 G
    const eventually = target("balance", "2026-10", { cadence: "custom", amount: 300_00n });
    expect(need([f("2026-10", 500_00n)], eventually)).toMatchObject({
      monthAmount: 0n,
      overfunded: 0n,
    });
  });
});

// The YNAB test cards in docs/verify.md ("Credit card payment targets"), checked 2026-10-08.
describe("payment targets", () => {
  const card = (month: string, assigned: bigint, fundedSpending = 0n, payments = 0n) => ({
    month,
    assigned,
    activity: fundedSpending + payments,
    fundedSpending,
    payments,
  });
  const payoff = (dueDate: string) =>
    target("balance", "2026-10", { cadence: "payoff_by_date", amount: 0n, dueDate });
  const pay = (h: MonthFigures[], t: CategoryTarget, owed: bigint, month = "2026-10") =>
    targetNeed(h, t, month, "2026-10", owed);

  it("pay off by date spreads what's owed beyond Available over the months left", () => {
    // E1: $120.00 by March 2027 from October asks a sixth.
    expect(pay([], payoff("2027-03-01"), 120_00n)).toMatchObject({
      needed: 120_00n,
      funded: 0n,
      underfunded: 20_00n,
      monthAmount: 20_00n,
      dueDate: "2027-03-01",
    });
    // E2: $100.00 by December rounds up.
    expect(pay([], payoff("2026-12-01"), 100_00n)?.underfunded).toBe(33_34n);
    // E1 with $5.00 of credit overspending: what's owed rises at once.
    expect(pay([], payoff("2027-03-01"), 125_00n)?.underfunded).toBe(20_84n);
  });

  it("pay off by date: funded card spending changes nothing", () => {
    // E2: $10.00 of funded spending, $110.00 owed: "Pay off $100.00", 0%.
    const h = [card("2026-10", 0n, 10_00n)];
    expect(pay(h, payoff("2026-12-01"), 110_00n)).toMatchObject({
      needed: 100_00n,
      funded: 0n,
      underfunded: 33_34n,
    });
    // November: the $10.00 carried in counts: ($110.00 − $10.00) ÷ 2.
    expect(pay(h, payoff("2026-12-01"), 110_00n, "2026-11")?.underfunded).toBe(50_00n);
  });

  it("pay off by date: a payment without money set aside leaves what's to go alone", () => {
    // E2 after a $20.00 payment: $90.00 owed, −$10.00 Available; still $100.00 to go.
    const h = [card("2026-10", 0n, 10_00n, -20_00n)];
    const need = pay(h, payoff("2026-12-01"), 90_00n);
    expect(need && need.needed - need.funded).toBe(100_00n);
    expect(need?.underfunded).toBe(33_34n);
    // The overpayment is cash overspending and doesn't roll over: November asks $90.00 ÷ 2.
    expect(pay(h, payoff("2026-12-01"), 90_00n, "2026-11")?.underfunded).toBe(45_00n);
  });

  it("pay off by date: assigning more than the share is on track, and the rest is over", () => {
    // E1: $50.00 assigned against $125.00: 40%, nothing more this month, $29.16 over.
    const h = [card("2026-10", 50_00n)];
    const need = pay(h, payoff("2027-03-01"), 125_00n);
    expect(need).toMatchObject({ needed: 125_00n, funded: 50_00n, underfunded: 0n });
    expect(need?.overfunded).toBe(29_16n);
    expect(need && targetPercent(need)).toBe(40);
    // November: ($125.00 − $50.00) ÷ 5.
    expect(pay(h, payoff("2027-03-01"), 125_00n, "2026-11")?.underfunded).toBe(15_00n);
  });

  it("pay off by date asks the rest in its month and nothing after it", () => {
    expect(pay([], payoff("2026-10-01"), 120_00n)?.underfunded).toBe(120_00n);
    expect(pay([], payoff("2026-09-01"), 120_00n)).toBeNull();
  });

  it("pay specific amount monthly asks the amount each month, whatever was paid or spent", () => {
    const monthly = target("set_aside", "2026-10", { cadence: "payment_monthly", amount: 30_00n });
    // E3: $30.00 a month, $5.00 credit overspending on the card.
    expect(pay([], monthly, 105_00n)).toMatchObject({ needed: 30_00n, underfunded: 30_00n });
    // $50.00 assigned: met, $20.00 over; November asks $30.00 again with $50.00 carried in.
    const h = [card("2026-10", 50_00n)];
    expect(pay(h, monthly, 105_00n)).toMatchObject({ underfunded: 0n, overfunded: 20_00n });
    expect(pay(h, monthly, 105_00n, "2026-11")?.underfunded).toBe(30_00n);
  });
});

describe("targetPercent", () => {
  it("rounds down and stays within 0–100", () => {
    expect(targetPercent({ needed: 100_00n, funded: 40_00n })).toBe(40);
    expect(targetPercent({ needed: 100_00n, funded: 99_99n })).toBe(99); // YNAB C5 R1: 99%
    expect(targetPercent({ needed: 40_00n, funded: 15_00n })).toBe(37); // C5 W2 in November
    expect(targetPercent({ needed: 100_00n, funded: 150_00n })).toBe(100);
    expect(targetPercent({ needed: 100_00n, funded: -20_00n })).toBe(0);
    // On track for a yearly target: a third of the total (YNAB showed 33%).
    expect(targetPercent({ needed: 1000_00n, funded: 333_34n })).toBe(33);
  });
});
