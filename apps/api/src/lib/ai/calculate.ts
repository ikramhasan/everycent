import { all, create, type FactoryFunctionMap } from "mathjs";

// The assistant's calculator. A language model's arithmetic isn't reliable, so sums, differences
// and percentages go through mathjs instead: exact decimals (BigNumber, 64 significant digits, so
// 0.1 + 0.2 is 0.3), in mathjs's sandboxed expression parser (no JavaScript `eval`).

// mathjs types `all` as possibly undefined; the full build always has it (mathjs docs: create(all)).
const math = create(all as FactoryFunctionMap, {
  number: "BigNumber",
  precision: 64,
  // Tolerances near the precision limit, as mathjs's BigNumber docs advise for comparisons and
  // rounding.
  relTol: 1e-60,
  absTol: 1e-63,
});
const evaluate = math.evaluate;

/** Turned off, per mathjs's security guide, plus whatever builds a large matrix (a CPU hog). */
const DISABLED = [
  "import",
  "createUnit",
  "reviver",
  "evaluate",
  "parse",
  "simplify",
  "derivative",
  "resolve",
  "matrix",
  "zeros",
  "ones",
  "identity",
  "range",
  "diag",
  "resize",
];
math.import(
  Object.fromEntries(
    DISABLED.map((name) => [
      name,
      () => {
        throw new Error(`${name} isn't available in this calculator`);
      },
    ]),
  ),
  { override: true },
);

/** Longer than any real budget sum; keeps a pathological expression from tying up the server. */
const MAX_LENGTH = 1000;

export type CalculateResult = { expression: string; result: string } | { error: string };

/** Evaluates one expression; the result as a plain decimal string. */
export function calculate(expression: string): CalculateResult {
  if (expression.length > MAX_LENGTH) {
    return { error: `Expressions are limited to ${MAX_LENGTH} characters` };
  }
  try {
    const value: unknown = evaluate(expression);
    if (math.isBigNumber(value) || typeof value === "number") {
      return { expression, result: math.format(value, { notation: "fixed" }) };
    }
    if (typeof value === "boolean") return { expression, result: String(value) };
    return { error: "The expression must work out to a single number" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't evaluate that" };
  }
}
