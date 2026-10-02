import { describe, expect, it } from "vitest";
import { fundedCardSpending } from "./credit";

// Account ids sort by creation (UUIDv7): visa < amex < citi.
const VISA = "01-visa";
const AMEX = "02-amex";
const CITI = "03-citi";
const card = (accountId: string, amount: bigint) => ({ accountId, amount });
const funded = (cash: bigint, cards: ReturnType<typeof card>[]) =>
  Object.fromEntries(fundedCardSpending(cash, cards));

describe("fundedCardSpending", () => {
  // Cases from YNAB's test plan (2026-10-03), docs/verify.md phase 7b.
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
    // $5 and two −$4 purchases: Medical and Emergency gave Amex (newer) $4; Dining gave Citi $4.
    [
      "newest card first when money runs out",
      500n,
      [card(VISA, -400n), card(AMEX, -400n)],
      { [AMEX]: 400n, [VISA]: 100n },
    ],
    [
      "newest of three",
      500n,
      [card(AMEX, -400n), card(CITI, -400n)],
      { [CITI]: 400n, [AMEX]: 100n },
    ],
    [
      "a return on one card funds another",
      0n,
      [card(AMEX, 500n), card(VISA, -300n)],
      { [AMEX]: -500n, [VISA]: 300n },
    ],
  ])("%s", (_, cash, cards, moved) => {
    expect(funded(cash, cards)).toEqual(moved);
  });

  it("keeps money and debt in balance", () => {
    // Whatever isn't funded stays in the category as (credit) overspending.
    const cards = [card(VISA, -700n), card(AMEX, -200n), card(CITI, 100n)];
    const moved = [...fundedCardSpending(300n, cards).values()].reduce((a, b) => a + b, 0n);
    expect(moved).toBe(300n);
  });
});
