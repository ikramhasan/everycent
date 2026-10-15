import { describe, expect, it } from "vitest";
import { matchPayeeRule, payeeRuleMatches } from "./payee-rules";

describe("payeeRuleMatches", () => {
  it("IS needs the whole name, case aside", () => {
    expect(payeeRuleMatches({ operator: "is", text: "Starbucks" }, "STARBUCKS")).toBe(true);
    expect(payeeRuleMatches({ operator: "is", text: "Starbucks" }, "Starbucks #123")).toBe(false);
  });

  it("CONTAINS finds the text anywhere, case aside", () => {
    const rule = { operator: "contains", text: "bucks" } as const;
    expect(payeeRuleMatches(rule, "SQ *STARBUCKS #123")).toBe(true);
    expect(payeeRuleMatches(rule, "Dunkin")).toBe(false);
  });

  it("compares the text as stored and never matches empty text", () => {
    expect(payeeRuleMatches({ operator: "contains", text: " Shop " }, "Coffee Shop")).toBe(false);
    expect(payeeRuleMatches({ operator: "contains", text: "" }, "Anything")).toBe(false);
    expect(payeeRuleMatches({ operator: "is", text: "" }, "")).toBe(false);
  });
});

describe("matchPayeeRule", () => {
  const rules = [
    { id: "old", payeeId: "coffee", operator: "contains", text: "star" },
    { id: "tea", payeeId: "tea", operator: "is", text: "TeaHouse" },
    { id: "new", payeeId: "bucks", operator: "contains", text: "bucks" },
  ] as const;

  it("ORs a payee's rules", () => {
    expect(matchPayeeRule(rules, "teahouse")?.payeeId).toBe("tea");
    expect(matchPayeeRule(rules, "Star Market")?.payeeId).toBe("coffee");
  });

  it("lets the newest matching rule win across payees", () => {
    expect(matchPayeeRule(rules, "STARBUCKS")?.id).toBe("new");
  });

  it("returns undefined when nothing matches", () => {
    expect(matchPayeeRule(rules, "Grocer")).toBeUndefined();
    expect(matchPayeeRule([], "Grocer")).toBeUndefined();
  });
});
