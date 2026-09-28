import { describe, expect, it } from "vitest";
import { money } from "./money";
import { fromWire, toWire, zMoney } from "./wire";

describe("wire format", () => {
  it("serializes amounts as integer strings", () => {
    expect(toWire(money(-12345n, "USD"))).toEqual({ amount: "-12345", currency: "USD" });
    expect(fromWire({ amount: "90071992547409931234", currency: "JPY" })).toEqual(
      money(90071992547409931234n, "JPY"),
    );
  });

  it("validates wire payloads", () => {
    expect(zMoney.safeParse({ amount: "100", currency: "USD" }).success).toBe(true);
    expect(zMoney.safeParse({ amount: "0", currency: "USD" }).success).toBe(true);
    for (const bad of [
      { amount: 100, currency: "USD" },
      { amount: "1.00", currency: "USD" },
      { amount: "01", currency: "USD" },
      { amount: "-0", currency: "USD" },
      { amount: "", currency: "USD" },
      { amount: "100", currency: "usd" },
      { amount: "100", currency: "XXX" },
    ]) {
      expect(zMoney.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
