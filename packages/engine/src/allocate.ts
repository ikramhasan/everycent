import { type Money, money } from "./money";

/**
 * Splits `m` proportionally to non-negative integer `ratios` without losing a minor unit
 * (largest-remainder method; ties go to the earlier index).
 */
export function allocate(m: Money, ratios: readonly (number | bigint)[]): Money[] {
  if (ratios.length === 0) throw new RangeError("allocate requires at least one ratio");
  const weights = ratios.map((ratio) => {
    if (typeof ratio === "number" && !Number.isInteger(ratio)) {
      throw new RangeError(`Ratios must be integers, got ${ratio}`);
    }
    const weight = BigInt(ratio);
    if (weight < 0n) throw new RangeError(`Ratios must be non-negative, got ${ratio}`);
    return weight;
  });
  const total = weights.reduce((a, b) => a + b, 0n);
  if (total === 0n) throw new RangeError("Ratios must not all be zero");

  const negative = m.amount < 0n;
  const magnitude = negative ? -m.amount : m.amount;
  const shares = weights.map((w) => (magnitude * w) / total);
  let leftover = magnitude - shares.reduce((a, b) => a + b, 0n);

  const byRemainder = weights
    .map((w, index) => ({ index, remainder: (magnitude * w) % total }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
  for (const { index } of byRemainder) {
    if (leftover === 0n) break;
    shares[index] = (shares[index] ?? 0n) + 1n;
    leftover -= 1n;
  }

  return shares.map((share) => money(negative ? -share : share, m.currency));
}
