import { describe, expect, it } from "vitest";
import {
  payeeAutoCategory,
  payeePrefillCategory,
  payeeRecentCategories,
  payeeSuggestions,
} from "./payee-category";

describe("payeeAutoCategory", () => {
  it("has no default without history", () => {
    expect(payeeAutoCategory([])).toBeNull();
  });

  it("takes the first categorization", () => {
    expect(payeeAutoCategory(["a"])).toBe("a");
  });

  it("keeps the default until two of the last three agree on another (YNAB register)", () => {
    expect(payeeAutoCategory(["a", "b"])).toBe("a");
    expect(payeeAutoCategory(["a", "a", "b"])).toBe("a");
    expect(payeeAutoCategory(["a", "b", "c"])).toBe("a");
    expect(payeeAutoCategory(["a", "b", "b"])).toBe("b");
    expect(payeeAutoCategory(["a", "b", "a", "b"])).toBe("b");
  });

  it("only looks at the last three each time", () => {
    // a a a b c: the last three (a b c) don't agree, so a stays.
    expect(payeeAutoCategory(["a", "a", "a", "b", "c"])).toBe("a");
    // b c b: two agree on b.
    expect(payeeAutoCategory(["a", "a", "b", "c", "b"])).toBe("b");
    // c b c after b won: c.
    expect(payeeAutoCategory(["a", "b", "b", "c", "a", "c"])).toBe("c");
  });

  it("keeps a carried default until two of three agree", () => {
    expect(payeeAutoCategory([], "g")).toBe("g");
    expect(payeeAutoCategory(["d"], "g")).toBe("g");
    expect(payeeAutoCategory(["d", "e"], "g")).toBe("g");
    expect(payeeAutoCategory(["d", "e", "d"], "g")).toBe("d");
  });
});

describe("payeePrefillCategory", () => {
  const payee = { defaultCategoryId: "chosen", autoCategoryId: "auto" };

  it("uses the history default when auto-categorizing", () => {
    expect(payeePrefillCategory({ ...payee, categorization: "auto" })).toBe("auto");
  });

  it("uses the chosen category when always using my choice", () => {
    expect(payeePrefillCategory({ ...payee, categorization: "always" })).toBe("chosen");
  });

  it("fills nothing when not auto-categorizing", () => {
    expect(payeePrefillCategory({ ...payee, categorization: "never" })).toBeNull();
  });

  it("falls back to the history default when the chosen category is gone", () => {
    expect(
      payeePrefillCategory({
        categorization: "always",
        defaultCategoryId: null,
        autoCategoryId: "a",
      }),
    ).toBe("a");
  });
});

describe("payee suggestions", () => {
  it("lists each recent category once, newest first, keeping six", () => {
    expect(payeeRecentCategories(["c", "b", "c", "a", "d", "e", "f", "g"])).toEqual([
      "c",
      "b",
      "a",
      "d",
      "e",
      "f",
    ]);
  });

  it("leaves out the selected category and shows five", () => {
    const recent = ["c", "b", "a", "d", "e", "f"];
    expect(payeeSuggestions(recent, "c")).toEqual(["b", "a", "d", "e", "f"]);
    expect(payeeSuggestions(recent, null)).toEqual(["c", "b", "a", "d", "e"]);
    expect(payeeSuggestions(["c", "b", "a"], "b")).toEqual(["c", "a"]);
  });
});
