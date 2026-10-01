import { type Database, newId } from "@everycent/db";
import * as schema from "@everycent/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import type { Env } from "../env";
import { budgetAc, budgetRoles } from "./budget-access-control";
import { seedInternalCategories } from "./starter-categories";

export function createAuth(db: Database, env: Env) {
  return betterAuth({
    appName: "everycent",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, autoSignIn: true },
    advanced: { database: { generateId: () => newId() } },
    telemetry: { enabled: false },
    plugins: [
      // Budgets are organizations. Its HTTP endpoints are blocked in app.ts; our /v1/budgets
      // routes call auth.api.* instead so everything goes through our validation.
      organization({
        ac: budgetAc,
        roles: budgetRoles,
        creatorRole: "owner",
        organizationHooks: {
          afterCreateOrganization: async ({ organization }) => {
            // Every budget needs these, however it was created.
            await seedInternalCategories(db, organization.id);
          },
        },
        schema: {
          organization: {
            modelName: "budget",
            additionalFields: {
              currency: { type: "string", required: true, input: true },
              numberFormat: { type: "string", required: true, input: true },
              currencySymbolPosition: { type: "string", required: true, input: true },
              dateFormat: { type: "string", required: true, input: true },
            },
          },
          member: { modelName: "budgetMember", fields: { organizationId: "budgetId" } },
          invitation: { modelName: "budgetInvitation", fields: { organizationId: "budgetId" } },
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthUser = Auth["$Infer"]["Session"]["user"];
export type AuthSession = Auth["$Infer"]["Session"]["session"];
