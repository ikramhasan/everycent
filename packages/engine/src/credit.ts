/** One credit account's net activity in a category for a month (negative: spending). */
export interface CardActivity {
  accountId: string;
  /** Net of the card's spending and returns in the category this month (minor units). */
  amount: bigint;
}

/**
 * How much of a category's card activity in a month moves into each card's payment category
 * (positive) or back out of it (negative): YNAB's Funded Spending, checked in its web app on
 * 2026-10-03 (docs/verify.md, phase 7b):
 *
 * - `cash` is what the category has before card spending: carried in, assigned and its cash
 *   activity. Cash is funded first, in whatever order transactions were entered.
 * - A card's spending and returns in the category net out. A card that returned more than it
 *   spent takes that money back out of its payment category, whether or not the category is
 *   overspent, and the money is the category's again.
 * - Each spending card moves only the funded part: no more than the category has left. The rest is
 *   credit overspending (phase 7c).
 *
 * Built so far, before YNAB settles it (docs/verify.md, "Several cards competing" and "Returns on
 * one card, spending on another"): when the category can't fund every card, the newest card
 * (highest UUIDv7 account id) is funded first, which matched all three cases seen; a return on one
 * card can fund spending on another, which matched the categories' Available in all four cases. The
 * month is taken as a whole (cash first across all its dates).
 */
export function fundedCardSpending(
  cash: bigint,
  cards: readonly CardActivity[],
): Map<string, bigint> {
  const moved = new Map<string, bigint>();
  let pool = cash;
  for (const card of cards) {
    if (card.amount > 0n) {
      moved.set(card.accountId, -card.amount);
      pool += card.amount;
    }
  }
  const spending = cards
    .filter((c) => c.amount < 0n)
    .sort((a, b) => (a.accountId < b.accountId ? 1 : a.accountId > b.accountId ? -1 : 0));
  for (const card of spending) {
    const funded = pool <= 0n ? 0n : pool < -card.amount ? pool : -card.amount;
    moved.set(card.accountId, (moved.get(card.accountId) ?? 0n) + funded);
    pool -= funded;
  }
  return moved;
}
