export type RoundingMode = "half-even" | "half-up" | "floor" | "ceil" | "trunc";

/**
 * Integer division with explicit rounding. `half-up` rounds ties away from zero;
 * `half-even` (banker's rounding) rounds ties to the nearest even quotient.
 */
export function divideRounded(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode = "half-even",
): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");
  const num = denominator < 0n ? -numerator : numerator;
  const den = denominator < 0n ? -denominator : denominator;

  const quotient = num / den; // truncates toward zero
  const remainder = num % den; // has the sign of num
  if (remainder === 0n) return quotient;

  const awayFromZero = num < 0n ? quotient - 1n : quotient + 1n;
  switch (mode) {
    case "trunc":
      return quotient;
    case "floor":
      return num < 0n ? quotient - 1n : quotient;
    case "ceil":
      return num < 0n ? quotient : quotient + 1n;
    case "half-up":
    case "half-even": {
      const twiceRemainder = 2n * (remainder < 0n ? -remainder : remainder);
      if (twiceRemainder > den) return awayFromZero;
      if (twiceRemainder < den) return quotient;
      if (mode === "half-up") return awayFromZero;
      return quotient % 2n === 0n ? quotient : awayFromZero;
    }
  }
}
