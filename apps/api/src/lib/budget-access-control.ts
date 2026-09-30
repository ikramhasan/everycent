import type { BudgetRole } from "@everycent/db/schema";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

/**
 * Budget roles, modelled on YNAB Together: the owner (creator) manages sharing, deletion and fresh
 * start; everyone the budget is shared with can do everything else. The plugin checks
 * `organization` permissions on its own endpoints, so budget-level actions use that resource name.
 * Later phases add resources here (e.g. `transaction: ["create", "update", "delete"]`).
 */
export const budgetAc = createAccessControl({
  ...defaultStatements,
  category: ["create", "update", "delete"],
} as const);

export const budgetRoles = {
  owner: budgetAc.newRole({
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    category: ["create", "update", "delete"],
  }),
  editor: budgetAc.newRole({
    organization: ["update"],
    category: ["create", "update", "delete"],
  }),
} satisfies Record<BudgetRole, unknown>;

export type BudgetPermission = Parameters<(typeof budgetRoles)["owner"]["authorize"]>[0];
