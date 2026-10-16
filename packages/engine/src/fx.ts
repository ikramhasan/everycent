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

/** Decimal places every stored or computed rate keeps (Postgres `numeric(30,12)`). */
export const RATE_SCALE = 12;
const RATE_UNIT = 10n ** BigInt(RATE_SCALE);
const DECIMAL = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/**
 * A positive decimal rate (plain or JSON exponent form) as an integer in units of 10^-12,
 * rounded half-even at the 12th decimal. Throws RangeError when malformed or not above zero.
 */
export function rateToScaled(rate: string): bigint {
  const match = DECIMAL.exec(rate);
  if (!match) throw new RangeError(`Invalid FX rate "${rate}"`);
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? "0");
  if (Math.abs(exponent) > 100) throw new RangeError(`FX rate "${rate}" is out of range`);
  const digits = BigInt(`${match[1]}${fraction}`);
  // value = digits × 10^(exponent − fraction digits); scaled = value × 10^12
  const shift = exponent - fraction.length + RATE_SCALE;
  const scaled =
    shift >= 0 ? digits * 10n ** BigInt(shift) : divideRounded(digits, 10n ** BigInt(-shift));
  if (scaled <= 0n) throw new RangeError(`FX rate "${rate}" must be greater than zero`);
  return scaled;
}

/** The decimal string for a rate in units of 10^-12, without trailing zeros. */
export function scaledToRate(scaled: bigint): string {
  if (scaled <= 0n) throw new RangeError("FX rate must be greater than zero");
  const whole = scaled / RATE_UNIT;
  const fraction = (scaled % RATE_UNIT).toString().padStart(RATE_SCALE, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Validates a rate and returns it at 12 decimals (half-even), trailing zeros trimmed. */
export function normalizeRate(rate: string): string {
  return scaledToRate(rateToScaled(rate));
}

/** "1 FROM = rate TO" turned into "1 TO = x FROM", at 12 decimals (half-even). */
export function invertRate(rate: string): string {
  return scaledToRate(divideRounded(RATE_UNIT * RATE_UNIT, rateToScaled(rate)));
}

/**
 * A→B from two rates against a common pivot ("1 A = aToPivot P", "1 B = bToPivot P"),
 * computed once from the exact inputs and rounded half-even at 12 decimals.
 */
export function crossRate(aToPivot: string, bToPivot: string): string {
  return scaledToRate(divideRounded(rateToScaled(aToPivot) * RATE_UNIT, rateToScaled(bToPivot)));
}

type ReviverContext = { source?: string };

/**
 * Parses JSON with every number kept as its exact source text (the reviver's `context.source`),
 * so a provider's rates never pass through a float.
 */
export function parseJsonExact(text: string): unknown {
  const reviver = (_key: string, value: unknown, context?: ReviverContext) => {
    if (typeof value !== "number") return value;
    if (typeof context?.source !== "string") {
      throw new Error("This runtime can't read JSON numbers exactly (no reviver context.source)");
    }
    return context.source;
  };
  return JSON.parse(text, reviver as (key: string, value: unknown) => unknown);
}

/**
 * The rates in a provider's JSON body: the object under the top-level `ratesKey`, keyed by
 * upper-cased three-letter code, each value normalized to 12 decimals. Entries that aren't a
 * three-letter code or a positive rate (crypto tokens, zeros) are left out. `date` is the
 * body's top-level `date`, when it has one.
 */
export function parseJsonRates(
  text: string,
  ratesKey: string,
): { date: string | null; rates: Record<string, string> } {
  const body = parseJsonExact(text);
  if (typeof body !== "object" || body === null) throw new Error("FX body is not a JSON object");
  const record = body as Record<string, unknown>;
  const raw = record[ratesKey];
  if (typeof raw !== "object" || raw === null) throw new Error(`FX body has no "${ratesKey}"`);
  const rates: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[a-zA-Z]{3}$/.test(key) || typeof value !== "string") continue;
    try {
      rates[key.toUpperCase()] = normalizeRate(value);
    } catch {
      // A zero or malformed entry just isn't a usable rate.
    }
  }
  return { date: typeof record.date === "string" ? record.date : null, rates };
}

/**
 * Converts a split's lines with the parent's rate so they still add up: the parent converts as a
 * whole (`convert`), each line on its own, and the rounding difference (at most half a minor unit
 * per line) goes to the largest line (the first of equals), so no money is created or lost.
 */
export function convertLines(
  parent: Money,
  lines: readonly bigint[],
  rate: string,
  target: CurrencyCode,
): { amount: bigint; lines: bigint[] } {
  const amount = convert(parent, rate, target).amount;
  const converted = lines.map((line) => convert(money(line, parent.currency), rate, target).amount);
  const difference = amount - converted.reduce((a, b) => a + b, 0n);
  if (difference !== 0n && converted.length > 0) {
    const abs = (n: bigint) => (n < 0n ? -n : n);
    let largest = 0;
    for (let i = 1; i < lines.length; i++) {
      if (abs(lines[i] as bigint) > abs(lines[largest] as bigint)) largest = i;
    }
    converted[largest] = (converted[largest] as bigint) + difference;
  }
  return { amount, lines: converted };
}

/**
 * The rate that turns `native` into `base` ("1 native unit = rate base units"), rounded half-even
 * to `RATE_SCALE` decimals; null when either side is zero or their signs differ.
 */
export function impliedRate(native: Money, base: Money): string | null {
  if (native.amount === 0n || base.amount === 0n) return null;
  if (native.amount < 0n !== base.amount < 0n) return null;
  const abs = (n: bigint) => (n < 0n ? -n : n);
  const numerator =
    abs(base.amount) * 10n ** BigInt(RATE_SCALE + currencyExponent(native.currency));
  const denominator = abs(native.amount) * 10n ** BigInt(currencyExponent(base.currency));
  return scaledToRate(divideRounded(numerator, denominator, "half-even"));
}
