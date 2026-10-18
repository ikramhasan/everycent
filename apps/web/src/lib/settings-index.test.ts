import { describe, expect, it } from "vitest";
import { searchSettings } from "./settings-index";

const titles = (query: string, role: Parameters<typeof searchSettings>[1] = "owner") =>
  searchSettings(query, role).map((m) => m.title);

describe("searchSettings", () => {
  it("finds nothing for an empty query", () => {
    expect(titles("  ")).toEqual([]);
  });

  it("ranks titles starting with the query, then containing it, then keywords", () => {
    expect(titles("currency")).toEqual([
      "Currency",
      "Currency symbol position",
      "Show account totals in",
      "Exchange rates",
    ]);
  });

  it("matches keywords, ignoring case", () => {
    expect(titles("2FA")).toEqual(["Two-step verification"]);
  });

  it("says where each setting is", () => {
    expect(searchSettings("devices", null)[0]).toMatchObject({
      page: "account",
      tab: "security",
      section: "devices",
      where: "Account settings › Security",
    });
  });

  it("leaves budget settings out without a budget", () => {
    expect(titles("delete", null)).toEqual(["Delete account"]);
  });

  it("leaves out what the budget role can't see", () => {
    expect(titles("delete", "editor")).toEqual(["Delete account"]);
    expect(titles("delete", "owner")).toEqual(["Delete account", "Delete budget"]);
    expect(titles("payees", "viewer")).toEqual([]);
    expect(titles("payees", "editor")).toEqual(["Payees"]);
  });
});
