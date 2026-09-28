export class MoneyError extends Error {
  override name = "MoneyError";
}

export class CurrencyMismatchError extends MoneyError {
  override name = "CurrencyMismatchError";
  constructor(
    readonly left: string,
    readonly right: string,
  ) {
    super(`Currency mismatch: ${left} vs ${right}`);
  }
}

export class UnknownCurrencyError extends MoneyError {
  override name = "UnknownCurrencyError";
  constructor(readonly code: string) {
    super(`Unknown ISO 4217 currency code "${code}"`);
  }
}

export class MoneyParseError extends MoneyError {
  override name = "MoneyParseError";
  constructor(
    readonly input: string,
    reason: string,
  ) {
    super(`Cannot parse "${input}" as money: ${reason}`);
  }
}
