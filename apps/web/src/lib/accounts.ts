import type { components } from "@everycent/api-client";
import { type AccountFamily, accountFamily, isOnBudget } from "@everycent/engine";
import { $api } from "./api";
import { todayIso } from "./dates";

export type Account = components["schemas"]["Account"];

/** Balances leave out transactions dated after the user's today. */
export const accountsQueryOptions = (budgetId: string, today = todayIso()) =>
  $api.queryOptions("get", "/v1/budgets/{budgetId}/accounts", {
    params: { path: { budgetId }, query: { today } },
  });

export type SidebarSectionId = "starred" | "budget" | "loans" | "tracking" | "closed";

export interface SidebarSection {
  id: SidebarSectionId;
  title: string;
  accounts: Account[];
  /**
   * Sum of the working balances of the accounts in the budget's currency, in its minor units
   * (closed accounts: always zero).
   */
  total: bigint;
  /**
   * Accounts in other currencies, left out of `total`: their amounts don't add up with the
   * budget's (converted totals: EVERYCENT-57).
   */
  excluded: Account[];
}

const SECTION_OF: Record<AccountFamily, SidebarSectionId> = {
  cash: "budget",
  credit: "budget",
  loan: "loans",
  tracking: "tracking",
};

const TITLES: Record<SidebarSectionId, string> = {
  starred: "Starred",
  budget: "Budget",
  loans: "Loans",
  tracking: "Tracking",
  closed: "Closed",
};

/** Whether YNAB shows the account's star: open cash and credit accounts only. */
export function canStar(account: Account) {
  return !account.closed && isOnBudget(account.type);
}

/** In the Starred group: starred, and still starrable (a closed account drops out). */
export function isStarred(account: Account) {
  return account.starredOrder !== null && canStar(account);
}

/**
 * YNAB's sidebar: Starred first (its own order; the accounts stay in their usual group too),
 * then open accounts by family, then closed ones. Empty sections are left out. Totals add up the
 * accounts in `budgetCurrency` only.
 */
export function sidebarSections(
  accounts: readonly Account[],
  budgetCurrency: string,
): SidebarSection[] {
  const order: SidebarSectionId[] = ["starred", "budget", "loans", "tracking", "closed"];
  const inSectionOf = (id: SidebarSectionId) => {
    if (id === "starred") {
      return accounts
        .filter(isStarred)
        .sort((a, b) => (a.starredOrder ?? 0) - (b.starredOrder ?? 0));
    }
    return accounts.filter((a) =>
      id === "closed" ? a.closed : !a.closed && SECTION_OF[accountFamily(a.type)] === id,
    );
  };
  return order
    .map((id) => {
      const inSection = inSectionOf(id);
      const total = inSection
        .filter((a) => a.currency === budgetCurrency)
        .reduce((sum, a) => sum + BigInt(a.balances.working), 0n);
      const excluded = inSection.filter((a) => a.currency !== budgetCurrency);
      return { id, title: TITLES[id], accounts: inSection, total, excluded };
    })
    .filter((s) => s.accounts.length > 0);
}

/**
 * What YNAB's Close Account dialog says for an account whose working balance isn't zero: the
 * closing adjustment (minus the balance), and whether it adds the info box "The money in this
 * account will be removed from your plan…". The box shows only for money in the plan: an
 * on-budget (cash or credit) account above zero. An overdrawn cash account, a card in debt and a
 * tracking account of either sign get none (EVERYCENT-129, checked in YNAB 2026-10-14).
 */
export function closeAccountNotice(
  type: Account["type"],
  working: bigint,
): { adjustment: bigint; removesMoneyFromPlan: boolean } {
  return { adjustment: -working, removesMoneyFromPlan: working > 0n && isOnBudget(type) };
}

/**
 * The hint on a sidebar total that leaves accounts out: "Excludes 1 EUR account", "Excludes 2
 * accounts in other currencies".
 */
export function excludedHint(excluded: readonly Pick<Account, "currency">[]): string | null {
  if (excluded.length === 0) return null;
  const currencies = new Set(excluded.map((a) => a.currency));
  const noun = excluded.length === 1 ? "account" : "accounts";
  return currencies.size === 1
    ? `Excludes ${excluded.length} ${[...currencies][0]} ${noun}`
    : `Excludes ${excluded.length} ${noun} in other currencies`;
}

/** YNAB labels Edit Account's balance field "Today's Balance" for loans and tracking accounts. */
export function editBalanceLabel(type: Account["type"]): string {
  const family = accountFamily(type);
  return family === "loan" || family === "tracking" ? "Today's Balance" : "Working Balance";
}
