import type { Context } from "hono";
import type { AuthedEnv } from "../middleware/require-auth";
import type { AppEnv } from "../types";
import { deleteBudgetRow } from "./delete-budget";

// biome-ignore lint/suspicious/noExplicitAny: any route's context
type Ctx = Context<AppEnv & AuthedEnv, any, any>;
/** A new budget: the plugin's fields plus our budget settings (`auth.ts` additionalFields). */
type CreateBody = {
  name: string;
  slug: string;
  currency: string;
  numberFormat: string;
  currencySymbolPosition: string;
  dateFormat: string;
  keepCurrentActiveOrganization?: boolean;
};

/**
 * Creates a budget through the organization plugin as the request's user: with their session's
 * headers, or, for an agent's request (no session), as a server call naming the user, which the
 * plugin allows. Either way the user becomes its owner.
 */
export function createOrganizationAs(c: Ctx, body: CreateBody) {
  const { auth } = c.var.deps;
  return c.var.agent
    ? auth.api.createOrganization({ body: { ...body, userId: c.var.user.id } })
    : auth.api.createOrganization({ body, headers: c.req.raw.headers });
}

/**
 * Deletes a budget the caller may delete (checked by the route): through the plugin with the
 * user's session, or, for an agent's request, directly as the plugin's own hook and delete would.
 */
export async function deleteOrganizationAs(c: Ctx, budgetId: string) {
  if (c.var.agent) return deleteBudgetRow(c.var.deps.db, budgetId);
  await c.var.deps.auth.api.deleteOrganization({
    body: { organizationId: budgetId },
    headers: c.req.raw.headers,
  });
}
