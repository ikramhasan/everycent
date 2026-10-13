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

export type SidebarSectionId = "budget" | "loans" | "tracking" | "closed";

export interface SidebarSection {
  id: SidebarSectionId;
  title: string;
  accounts: Account[];
  /** Sum of working balances in minor units (closed accounts: always zero). */
  total: bigint;
}

const SECTION_OF: Record<AccountFamily, SidebarSectionId> = {
  cash: "budget",
  credit: "budget",
  loan: "loans",
  tracking: "tracking",
};

const TITLES: Record<SidebarSectionId, string> = {
  budget: "Budget",
  loans: "Loans",
  tracking: "Tracking",
  closed: "Closed",
};

/** YNAB's sidebar: open accounts by family, then closed ones. Empty sections are left out. */
export function sidebarSections(accounts: readonly Account[]): SidebarSection[] {
  const order: SidebarSectionId[] = ["budget", "loans", "tracking", "closed"];
  return order
    .map((id) => {
      const inSection = accounts.filter((a) =>
        id === "closed" ? a.closed : !a.closed && SECTION_OF[accountFamily(a.type)] === id,
      );
      const total = inSection.reduce((sum, a) => sum + BigInt(a.balances.working), 0n);
      return { id, title: TITLES[id], accounts: inSection, total };
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

/** YNAB labels Edit Account's balance field "Today's Balance" for loans and tracking accounts. */
export function editBalanceLabel(type: Account["type"]): string {
  const family = accountFamily(type);
  return family === "loan" || family === "tracking" ? "Today's Balance" : "Working Balance";
}
