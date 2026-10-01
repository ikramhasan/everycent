import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPES,
  accountFamily,
  hasPaymentCategory,
  isDebtAccount,
  isOnBudget,
  usesCategory,
} from "./accounts";

describe("account types", () => {
  it("puts cash and credit accounts on budget, loans and tracking off budget", () => {
    const onBudget = ACCOUNT_TYPES.filter(isOnBudget);
    expect(onBudget).toEqual(["checking", "savings", "cash", "credit_card", "line_of_credit"]);
  });

  it("categorizes transfers only where money leaves the budget", () => {
    expect(usesCategory("checking")).toBe(true);
    expect(usesCategory("asset")).toBe(false);
    expect(usesCategory("checking", "credit_card")).toBe(false);
    expect(usesCategory("checking", "mortgage")).toBe(true);
    expect(usesCategory("mortgage", "checking")).toBe(false);
    expect(usesCategory("asset", "liability")).toBe(false);
  });

  it("gives payment categories to credit accounts only", () => {
    expect(ACCOUNT_TYPES.filter(hasPaymentCategory)).toEqual(["credit_card", "line_of_credit"]);
  });

  it("treats credit, loans and liabilities as debt", () => {
    expect(isDebtAccount("credit_card")).toBe(true);
    expect(isDebtAccount("mortgage")).toBe(true);
    expect(isDebtAccount("liability")).toBe(true);
    expect(isDebtAccount("asset")).toBe(false);
    expect(isDebtAccount("savings")).toBe(false);
  });

  it("maps every type to a family", () => {
    for (const type of ACCOUNT_TYPES) expect(accountFamily(type)).toBeTruthy();
    expect(accountFamily("medical_debt")).toBe("loan");
  });
});
