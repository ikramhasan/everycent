import { describe, expect, it } from "vitest";
import { fundedCardSpending } from "./credit";

// Account ids sort by creation (UUIDv7): visa < amex < citi.
const VISA = "01-visa";
const AMEX = "02-amex";
const CITI = "03-citi";
const card = (accountId: string, amount: bigint, date = "2026-10-01") => ({
  accountId,
  date,
  amount,
});
const funded = (cash: bigint, cards: ReturnType<typeof card>[]) =>
  Object.fromEntries(fundedCardSpending(cash, cards).moved);

describe("fundedCardSpending", () => {
  // Cases from YNAB's test plans (2026-10-03 and 2026-10-11), docs/verify.md phase 7b.
  it.each([
    // [case, cash before cards, cards, moved]
    ["fully funded on one card", 2000n, [card(VISA, -500n)], { [VISA]: 500n }],
    ["nothing funded without money", 0n, [card(VISA, -500n)], { [VISA]: 0n }],
    ["overspent cash leaves nothing", -300n, [card(VISA, -500n)], { [VISA]: 0n }],
    // Rent: $10 assigned, Wallet −$6, Visa −$8: $4 moves, whatever the entry order.
    ["cash is funded first", 1000n - 600n, [card(VISA, -800n)], { [VISA]: 400n }],
    // Phone & Internet: $20 + cash $6; Visa −$5 −$7 +$2 nets −$10, Amex −$3.
    [
      "two cards, enough money",
      2600n,
      [card(VISA, -1000n), card(AMEX, -300n)],
      { [VISA]: 1000n, [AMEX]: 300n },
    ],
    // Groceries (overspent in cash) and Vacation: a return on the card leaves its payment category.
    ["a return on an overspent category", -500n, [card(VISA, 100n)], { [VISA]: -100n }],
    ["a return on a funded category", 500n, [card(VISA, 200n)], { [VISA]: -200n }],
    // G-F1/G-F2 ($5): the earlier purchase is funded first, whichever card was created first.
    [
      "earliest purchase first",
      500n,
      [card(VISA, -400n, "2026-10-02"), card(AMEX, -300n, "2026-10-01")],
      { [AMEX]: 300n, [VISA]: 200n },
    ],
    [
      "earliest purchase first, swapped",
      500n,
      [card(VISA, -300n, "2026-10-01"), card(AMEX, -400n, "2026-10-02")],
      { [VISA]: 300n, [AMEX]: 200n },
    ],
    // G-T1/G-T2 ($5): on the same day the largest purchase goes first.
    [
      "same day, largest first",
      500n,
      [card(AMEX, -300n), card(VISA, -400n)],
      { [VISA]: 400n, [AMEX]: 100n },
    ],
    [
      "same day, largest first, swapped",
      500n,
      [card(VISA, -300n), card(AMEX, -400n)],
      { [AMEX]: 400n, [VISA]: 100n },
    ],
    // $5 and two −$4 purchases on one day: Medical and Emergency gave Amex (newer) $4; Dining gave
    // Citi $4. Provisional tie-break.
    [
      "newest card first on a tie",
      500n,
      [card(VISA, -400n), card(AMEX, -400n)],
      { [AMEX]: 400n, [VISA]: 100n },
    ],
    [
      "newest of three on a tie",
      500n,
      [card(AMEX, -400n), card(CITI, -400n)],
      { [CITI]: 400n, [AMEX]: 100n },
    ],
    // G-X1 ($0): Card R1 +$5 on 10/01, Card R2 −$3 on 10/02.
    [
      "a return funds later spending on another card",
      0n,
      [card(AMEX, 500n, "2026-10-01"), card(VISA, -300n, "2026-10-02")],
      { [AMEX]: -500n, [VISA]: 300n },
    ],
    // G-X2 ($0): Card R4 −$3 on 10/01, Card R3 +$5 on 10/02: R4 stays unfunded, R3 gives up $2.
    [
      "a return refills earlier unfunded spending first",
      0n,
      [card(VISA, -300n, "2026-10-01"), card(AMEX, 500n, "2026-10-02")],
      { [VISA]: 0n, [AMEX]: -200n },
    ],
    // G-X6 ($0): Card R7 −$2 on 10/04 and +$6 on 10/05: $4 moves out.
    [
      "a refund larger than the month's purchases",
      0n,
      [card(VISA, -200n, "2026-10-04"), card(VISA, 600n, "2026-10-05")],
      { [VISA]: -400n },
    ],
  ])("%s", (_, cash, cards, moved) => {
    expect(funded(cash, cards)).toEqual(moved);
  });

  it("leaves a refilled purchase out of credit overspending", () => {
    const { unfunded } = fundedCardSpending(0n, [
      card(VISA, -300n, "2026-10-01"),
      card(CITI, -200n, "2026-10-02"),
      card(AMEX, 400n, "2026-10-03"),
    ]);
    // The return refills the earliest unfunded purchase first.
    expect(Object.fromEntries(unfunded)).toEqual({ [CITI]: 100n });
  });

  it("doesn't fund card spending from a return while the category is overspent in cash", () => {
    const moved = funded(-500n, [card(AMEX, 200n, "2026-10-01"), card(VISA, -300n, "2026-10-02")]);
    expect(moved).toEqual({ [AMEX]: -200n, [VISA]: 0n });
  });

  it("keeps money and debt in balance", () => {
    // Whatever isn't funded stays in the category as (credit) overspending.
    const cards = [card(VISA, -700n), card(AMEX, -200n), card(CITI, 100n, "2026-10-02")];
    const { moved, unfunded } = fundedCardSpending(300n, cards);
    expect([...moved.values()].reduce((a, b) => a + b, 0n)).toBe(300n);
    expect([...unfunded.values()].reduce((a, b) => a + b, 0n)).toBe(500n);
  });
});
