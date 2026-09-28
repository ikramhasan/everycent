import { type CurrencyCode, currencyExponent } from "./currency";
import { type Money, money } from "./money";
import { divideRounded, type RoundingMode } from "./rounding";

const RATE = /^(\d+)(?:\.(\d+))?$/;

/**
 * Converts `m` into `target` using a decimal-string rate ("1 unit of m.currency = rate units of
 * target"). Computed with scaled bigint arithmetic; rounding happens exactly once.
 */
export function convert(
  m: Money,
  rate: string,
  target: CurrencyCode,
  mode: RoundingMode = "half-even",
): Money {
  const match = RATE.exec(rate);
  if (!match) throw new RangeError(`Invalid FX rate "${rate}"`);
  const fraction = match[2] ?? "";
  const scaledRate = BigInt(`${match[1]}${fraction}`);
  if (scaledRate === 0n) throw new RangeError("FX rate must be greater than zero");

  const numerator = m.amount * scaledRate * 10n ** BigInt(currencyExponent(target));
  const denominator = 10n ** BigInt(fraction.length + currencyExponent(m.currency));
  return money(divideRounded(numerator, denominator, mode), target);
}
