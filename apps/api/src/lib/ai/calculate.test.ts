import { describe, expect, it } from "vitest";
import { calculate } from "./calculate";

const result = (expression: string) => {
  const out = calculate(expression);
  return "result" in out ? out.result : out.error;
};

describe("calculate", () => {
  it("works in exact decimals", () => {
    expect(result("2+2")).toBe("4");
    expect(result("0.1 + 0.2")).toBe("0.3");
    expect(result("5273.50 - 12.50 - 8")).toBe("5253");
    expect(result("1400 + 292.47 + 98 + 65 + 56.2")).toBe("1911.67");
    expect(result("round(3060 * 0.15, 2)")).toBe("459");
    expect(result("round(1 / 3, 4)")).toBe("0.3333");
    expect(result("-1250 / 100")).toBe("-12.5");
    expect(result("sum(12.5, 8, 93.75)")).toBe("114.25");
    expect(result("(2500 - 500) / 2500 * 100")).toBe("80");
  });

  it("answers comparisons", () => {
    expect(result("292.47 > 98")).toBe("true");
  });

  it("explains a mistake instead of throwing", () => {
    expect(result("2 +")).toMatch(/unexpected end/i);
    expect(result("1 / 0")).toMatch(/single number|Infinity/);
    expect(result("[1, 2]")).toMatch(/isn't available/);
    expect(result('"text"')).toBe("The expression must work out to a single number");
  });

  it("can't reach the parser's riskier functions or build big matrices", () => {
    for (const expression of [
      "import({ x: 1 }, { override: true })",
      'createUnit("foo")',
      'evaluate("2+2")',
      'parse("2+2")',
      "zeros(100000, 100000)",
      "range(1, 100000000)",
    ]) {
      expect(result(expression), expression).toMatch(/isn't available in this calculator/);
    }
    expect(result(`1+${"1+".repeat(600)}1`)).toMatch(/limited to/);
  });
});
