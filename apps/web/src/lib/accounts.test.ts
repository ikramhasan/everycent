import { describe, expect, it } from "vitest";
import { type Account, closeAccountNotice, editBalanceLabel, sidebarSections } from "./accounts";

function account(id: string, type: Account["type"], working: string, closed = false): Account {
  return {
    id,
    name: id,
    type,
    note: "",
    closed,
    starredOrder: null,
    currency: "USD",
    interestRate: null,
    minimumPayment: null,
    escrowAmount: null,
    paymentCategoryId: null,
    hasHistory: false,
    lastReconciledAt: null,
    pairedCategoryId: null,
    lastPaymentDate: null,
    lastPaymentFromAccountId: null,
    migratedToAccountId: null,
    migratedFromAccountId: null,
    toReview: 0,
    balances: { cleared: working, uncleared: "0", working },
  };
}

describe("sidebarSections", () => {
  it("groups accounts like YNAB's sidebar, with totals", () => {
    const sections = sidebarSections([
      account("checking", "checking", "150000"),
      account("visa", "credit_card", "-37500"),
      account("mortgage", "mortgage", "-2500000"),
      account("house", "asset", "40000000"),
      account("old", "savings", "0", true),
    ]);
    expect(sections.map((s) => [s.id, s.accounts.map((a) => a.id), s.total])).toEqual([
      ["budget", ["checking", "visa"], 112500n],
      ["loans", ["mortgage"], -2500000n],
      ["tracking", ["house"], 40000000n],
      ["closed", ["old"], 0n],
    ]);
  });

  // YNAB, 2026-10-15 (EVERYCENT-149).
  it("puts starred open cash and credit accounts first, in their own order", () => {
    const star = (a: Account, order: number) => ({ ...a, starredOrder: order });
    const sections = sidebarSections([
      star(account("checking", "checking", "1000"), 1),
      star(account("visa", "credit_card", "-300"), 0),
      account("savings", "savings", "50"),
      star(account("closed", "savings", "0", true), 2),
    ]);
    expect(sections.map((s) => [s.id, s.title, s.accounts.map((a) => a.id), s.total])).toEqual([
      ["starred", "Starred", ["visa", "checking"], 700n],
      ["budget", "Budget", ["checking", "visa", "savings"], 750n],
      ["closed", "Closed", ["closed"], 0n],
    ]);
  });

  it("leaves out empty sections", () => {
    expect(sidebarSections([account("cash", "cash", "100")]).map((s) => s.id)).toEqual(["budget"]);
  });
});

describe("closeAccountNotice", () => {
  // Read off YNAB's Close Account dialog (EVERYCENT-129 and the credit-card findings).
  it.each([
    ["cash account with money (Wallet)", "checking", 92400n, -92400n, true],
    ["card above zero (Card P)", "credit_card", 1000n, -1000n, true],
    ["line of credit above zero", "line_of_credit", 500n, -500n, true],
    ["overdrawn checking (x-129-Overdrawn)", "checking", -1000n, 1000n, false],
    ["card in debt (Card Y)", "credit_card", -2000n, 2000n, false],
    ["tracking asset above zero (x-129-AssetPos)", "asset", 4900n, -4900n, false],
    ["tracking asset below zero (x-129-AssetNeg)", "asset", -600n, 600n, false],
    ["tracking liability owing (x-129-LiabDebt)", "liability", -10100n, 10100n, false],
    ["tracking liability above zero (x-129-LiabPos)", "liability", 1900n, -1900n, false],
  ] as const)("%s", (_, type, working, adjustment, removesMoneyFromPlan) => {
    expect(closeAccountNotice(type, working)).toEqual({ adjustment, removesMoneyFromPlan });
  });
});

describe("editBalanceLabel", () => {
  it("says Today's Balance for loans and tracking accounts, Working Balance otherwise", () => {
    expect(editBalanceLabel("checking")).toBe("Working Balance");
    expect(editBalanceLabel("credit_card")).toBe("Working Balance");
    expect(editBalanceLabel("mortgage")).toBe("Today's Balance");
    expect(editBalanceLabel("asset")).toBe("Today's Balance");
    expect(editBalanceLabel("liability")).toBe("Today's Balance");
  });
});
