import type { components } from "@everycent/api-client";
import { type AccountFamily, accountFamily } from "@everycent/engine";
import { $api } from "./api";

export type Account = components["schemas"]["Account"];
export type AccountTransaction = components["schemas"]["Transaction"];

export const accountsQueryOptions = (budgetId: string) =>
  $api.queryOptions("get", "/v1/budgets/{budgetId}/accounts", {
    params: { path: { budgetId } },
  });

export const accountTransactionsQueryOptions = (budgetId: string, accountId: string) =>
  $api.queryOptions("get", "/v1/budgets/{budgetId}/accounts/{accountId}/transactions", {
    params: { path: { budgetId, accountId } },
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
