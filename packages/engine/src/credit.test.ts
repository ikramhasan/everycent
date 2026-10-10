import { describe, expect, it } from "vitest";
import { type CardLineKind, cardLedger, fundedCardSpending } from "./credit";

// Account ids sort by creation (UUIDv7): visa < amex < citi.
const VISA = "01-visa";
const AMEX = "02-amex";
const CITI = "03-citi";
const card = (accountId: string, amount: bigint, date = "2026-10-01", order = accountId) => ({
  accountId,
  date,
  amount,
  order,
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
    // G-E1–G-E4 ($5, two −$4 on one day): the smaller transaction id is funded first, whichever
    // card it's on.
    [
      "equal purchases by transaction id",
      500n,
      [card(VISA, -400n, "2026-10-06", "tx-b"), card(AMEX, -400n, "2026-10-06", "tx-a")],
      { [AMEX]: 400n, [VISA]: 100n },
    ],
    [
      "equal purchases by transaction id, swapped",
      500n,
      [card(VISA, -400n, "2026-10-06", "tx-a"), card(AMEX, -400n, "2026-10-06", "tx-b")],
      { [VISA]: 400n, [AMEX]: 100n },
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

  it("keeps a refilled purchase in its card's overspent categories (YNAB: Card R4)", () => {
    const { moved, unfunded } = fundedCardSpending(0n, [
      card(VISA, -300n, "2026-10-01"),
      card(AMEX, 500n, "2026-10-02"),
    ]);
    expect(Object.fromEntries(moved)).toEqual({ [VISA]: 0n, [AMEX]: -200n });
    expect(Object.fromEntries(unfunded)).toEqual({ [VISA]: 300n });
  });

  it("doesn't fund card spending from a return while the category is overspent in cash", () => {
    const moved = funded(-500n, [card(AMEX, 200n, "2026-10-01"), card(VISA, -300n, "2026-10-02")]);
    expect(moved).toEqual({ [AMEX]: -200n, [VISA]: 0n });
  });

  it("keeps money and debt in balance", () => {
    // Whatever isn't funded stays in the category as (credit) overspending.
    const cards = [card(VISA, -700n), card(AMEX, -200n), card(CITI, 100n, "2026-10-02")];
    const { moved } = fundedCardSpending(300n, cards);
    expect([...moved.values()].reduce((a, b) => a + b, 0n)).toBe(300n);
  });
});

describe("cardLedger", () => {
  // Cases from YNAB's "Onboarding Check" plan (2026-10-11), docs/verify.md phase 7e.
  let n = 0;
  const line = (date: string, amount: bigint, kind: CardLineKind) => {
    n += 1;
    const id = `t${String(n).padStart(3, "0")}`;
    return { id, transactionId: id, date, transactionAmount: amount, lineOrder: 0, amount, kind };
  };
  const effects = (lines: ReturnType<typeof line>[]) =>
    cardLedger(lines).map(({ cash, credit, readyToAssign }) => ({ cash, credit, readyToAssign }));
  const fx = (cash: bigint, credit: bigint, readyToAssign: bigint) => ({
    cash,
    credit,
    readyToAssign,
  });

  it("adds a payment's part above zero to Ready to Assign (Card X)", () => {
    expect(effects([line("2026-10-01", 1000n, "budgetTransfer")])).toEqual([fx(0n, 0n, 1000n)]);
  });

  it("makes spending while positive cash, and splits spending that crosses zero (Card Z)", () => {
    const lines = [
      line("2026-10-01", 500n, "budgetTransfer"),
      line("2026-10-02", -400n, "category"),
      line("2026-10-03", -300n, "category"),
    ];
    expect(effects(lines)).toEqual([fx(0n, 0n, 500n), fx(-400n, 0n, 0n), fx(-100n, -200n, 0n)]);
  });

  it("puts a day's spending before the payment that day (Card S1)", () => {
    // Entered after the payment, still counted first: credit, and the payment only adds $6.
    const lines = [
      line("2026-10-05", 1000n, "budgetTransfer"),
      line("2026-10-05", -400n, "category"),
    ];
    // Effects come back in the ledger's order: the spending, then the payment.
    expect(effects(lines)).toEqual([fx(0n, -400n, 0n), fx(0n, 0n, 600n)]);
  });

  it("counts money to and from Ready to Assign only above zero (Cards V and W)", () => {
    expect(
      effects([
        line("2026-10-01", 300n, "budgetTransfer"),
        line("2026-10-03", -500n, "readyToAssign"),
      ]),
    ).toEqual([fx(0n, 0n, 300n), fx(0n, 0n, -300n)]);
    expect(
      effects([
        line("2026-10-01", -500n, "readyToAssign"),
        line("2026-10-11", -200n, "readyToAssign"),
      ]),
    ).toEqual([fx(0n, 0n, 0n), fx(0n, 0n, 0n)]);
    // Card V (2026-10-03): $8 in at −$5 → +$3.
    expect(
      effects([
        line("2026-10-01", -500n, "readyToAssign"),
        line("2026-10-02", 800n, "readyToAssign"),
      ]),
    ).toEqual([fx(0n, 0n, 0n), fx(0n, 0n, 300n)]);
  });

  it("adds a cash advance's new debt (Cards A and W)", () => {
    expect(
      effects([
        line("2026-10-01", 600n, "budgetTransfer"),
        line("2026-10-03", -800n, "budgetTransfer"),
      ]),
    ).toEqual([fx(0n, 0n, 600n), fx(0n, 0n, 200n)]);
    expect(
      effects([
        line("2026-10-01", -500n, "readyToAssign"),
        line("2026-10-11", -300n, "budgetTransfer"),
      ]),
    ).toEqual([fx(0n, 0n, 0n), fx(0n, 0n, 300n)]);
  });

  it("pays down debt with a return first, the rest is cash (Card R8)", () => {
    expect(
      effects([line("2026-09-01", -300n, "readyToAssign"), line("2026-10-09", 500n, "category")]),
    ).toEqual([fx(0n, 0n, 0n), fx(200n, 300n, 0n)]);
  });

  it("takes a closed positive card's balance out of Ready to Assign (Card P)", () => {
    expect(
      effects([
        line("2026-10-01", 1000n, "budgetTransfer"),
        line("2026-10-11", -1000n, "readyToAssign"),
      ]),
    ).toEqual([fx(0n, 0n, 1000n), fx(0n, 0n, -1000n)]);
  });

  it("pays another card from the part above zero only (YNAB: Cards T1–T9)", () => {
    // T1 at +$10 sends $6 to a card: all of it from above zero, a payment there; no new debt.
    const out = cardLedger([
      line("2026-10-01", 1000n, "budgetTransfer"),
      line("2026-10-03", -600n, "creditTransfer"),
    ]);
    expect(out[1]).toMatchObject({ paidFromCash: 600n, readyToAssign: 0n });
    // T3 owing $10 sends $5: new debt, nothing paid from cash and nothing to Ready to Assign.
    const owing = cardLedger([
      line("2026-09-01", -1000n, "readyToAssign"),
      line("2026-10-03", -500n, "creditTransfer"),
    ]);
    expect(owing[1]).toMatchObject({ paidFromCash: 0n, readyToAssign: 0n });
    // T6 owing $2 receives $5: $2 pays its debt, $3 above zero goes to Ready to Assign.
    const received = cardLedger([
      line("2026-09-01", -200n, "readyToAssign"),
      line("2026-10-03", 500n, "creditTransfer"),
    ]);
    expect(received[1]).toMatchObject({ readyToAssign: 300n });
  });

  it("gives a split's cash part to its lines in order (YNAB: Cards T5, T8)", () => {
    const split = (id: string, order: number, amount: bigint) => ({
      id,
      transactionId: "s1",
      date: "2026-10-03",
      transactionAmount: -800n,
      lineOrder: order,
      amount,
      kind: "category" as const,
    });
    const effects = cardLedger([
      line("2026-10-01", 500n, "budgetTransfer"),
      split("first", 0, -500n),
      split("second", 1, -300n),
    ]);
    expect(effects.find((e) => e.id === "first")).toMatchObject({ cash: -500n, credit: 0n });
    expect(effects.find((e) => e.id === "second")).toMatchObject({ cash: 0n, credit: -300n });
  });
});
