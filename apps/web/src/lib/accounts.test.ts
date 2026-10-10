import { describe, expect, it } from "vitest";
import { type Account, sidebarSections } from "./accounts";

function account(id: string, type: Account["type"], working: string, closed = false): Account {
  return {
    id,
    name: id,
    type,
    note: "",
    closed,
    currency: "USD",
    interestRate: null,
    minimumPayment: null,
    escrowAmount: null,
    paymentCategoryId: null,
    hasHistory: false,
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

  it("leaves out empty sections", () => {
    expect(sidebarSections([account("cash", "cash", "100")]).map((s) => s.id)).toEqual(["budget"]);
  });
});
