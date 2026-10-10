/** One credit account's net activity in a category on one day (negative: spending). */
export interface CardActivity {
  accountId: string;
  /** ISO date (`YYYY-MM-DD`). */
  date: string;
  /** Net of the card's spending and returns in the category that day (minor units). */
  amount: bigint;
}

export interface FundedCardSpending {
  /** accountId → what moves into (positive) or out of (negative) the card's payment category. */
  moved: Map<string, bigint>;
  /** accountId → that card's spending left unfunded: credit overspending (positive). */
  unfunded: Map<string, bigint>;
}

/**
 * How a category's card activity in a month moves money into each card's payment category (or, for
 * returns, back out of it): YNAB's Funded Spending, checked in its web app and API (docs/verify.md,
 * "Funded card spending (phase 7b)"):
 *
 * - `cash` is what the category has before card spending: carried in, assigned and the whole
 *   month's cash activity. Cash is funded first, even cash spending dated after the card's
 *   (2026-10-11: $10 assigned, card −$8 on 10/01, cash −$6 on 10/05 moved $4).
 * - Card activity then runs in date order; on the same day the largest outflow goes first
 *   (2026-10-11, cards F1/F2). Each purchase is funded with what the category has left; the rest
 *   is credit overspending (phase 7c).
 * - A return first refills what earlier card spending left unfunded; only the rest leaves the
 *   returning card's payment category and is the category's again (2026-10-11: card −$3 on 10/01,
 *   another card's +$5 return on 10/02 left the first unfunded and moved $2 out). A return doesn't
 *   refill cash overspending: it moves out in full (2026-10-03, Groceries).
 *
 * Built so far, before YNAB settles it: two equal purchases on the same day fund the newest card
 * (highest UUIDv7 account id) first, which matched all three cases seen in 2026-10-03; refills go
 * to the earliest unfunded purchase first.
 */
export function fundedCardSpending(
  cash: bigint,
  cards: readonly CardActivity[],
): FundedCardSpending {
  const moved = new Map<string, bigint>();
  const unfunded = new Map<string, bigint>();
  const add = (map: Map<string, bigint>, id: string, n: bigint) =>
    map.set(id, (map.get(id) ?? 0n) + n);
  /** Unfunded purchases, oldest first, that a later return can refill. */
  const holes: { accountId: string; left: bigint }[] = [];
  /** What the category has for card spending; negative while it's overspent in cash. */
  let pool = cash;

  const ordered = [...cards].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0) ||
      (a.accountId < b.accountId ? 1 : a.accountId > b.accountId ? -1 : 0),
  );
  for (const { accountId, amount } of ordered) {
    if (amount < 0n) {
      const spent = -amount;
      const funded = pool <= 0n ? 0n : pool < spent ? pool : spent;
      pool -= funded;
      add(moved, accountId, funded);
      if (spent > funded) {
        add(unfunded, accountId, spent - funded);
        holes.push({ accountId, left: spent - funded });
      }
    } else if (amount > 0n) {
      let rest = amount;
      while (rest > 0n && holes.length > 0) {
        const hole = holes[0] as (typeof holes)[number];
        const fill = hole.left < rest ? hole.left : rest;
        hole.left -= fill;
        rest -= fill;
        add(unfunded, hole.accountId, -fill);
        if (hole.left === 0n) holes.shift();
      }
      add(moved, accountId, -rest);
      pool += rest;
    }
  }
  for (const card of cards) {
    if (!moved.has(card.accountId)) moved.set(card.accountId, 0n);
  }
  for (const [id, n] of unfunded) if (n === 0n) unfunded.delete(id);
  return { moved, unfunded };
}
