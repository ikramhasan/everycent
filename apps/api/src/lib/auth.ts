import { type Database, newId } from "@everycent/db";
import * as schema from "@everycent/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { haveIBeenPwned, organization } from "better-auth/plugins";
import type { Env } from "../env";
import { budgetAc, budgetRoles } from "./budget-access-control";
import type { EmailMessage, EmailSender } from "./email/sender";
import { emails } from "./email/templates";
import { seedInternalCategories } from "./starter-categories";

export interface AuthOptions {
  /** Better Auth's rate limiter. On everywhere but tests unless a test turns it on. */
  rateLimit?: boolean;
}

/** Both email-verification links and reset links stop working after this long. */
const LINK_LIFETIME_SECONDS = 60 * 60;

/** The `requestType` Better Auth signs into change-email tokens (absent for sign-up verification). */
function tokenRequestType(token: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
    return typeof payload.requestType === "string" ? payload.requestType : undefined;
  } catch {
    return undefined;
  }
}

export function createAuth(db: Database, env: Env, email: EmailSender, options: AuthOptions = {}) {
  const web = env.WEB_ORIGIN;
  const logFailure = (message: EmailMessage, e: unknown) =>
    console.error(`[email] failed to send a ${message.kind} email`, e);
  /**
   * Sends without holding up the response, so an endpoint answers in the same time whether or not
   * it sent anything (timing would otherwise reveal which addresses have accounts). Better Auth
   * awaits some send callbacks itself (resend confirmation), so this can't be left to its
   * background tasks. Tests await, so they can read the outbox straight away.
   */
  const deliver = async (message: EmailMessage) => {
    if (env.NODE_ENV === "test") return email.send(message);
    void email.send(message).catch((e) => logFailure(message, e));
  };
  /** Notices that mustn't fail the action they report (a password change has already happened). */
  const notify = async (message: EmailMessage) => {
    try {
      await deliver(message);
    } catch (e) {
      logFailure(message, e);
    }
  };

  return betterAuth({
    appName: "everycent",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [web],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      // No session until the address is confirmed. This also makes a sign-up with a taken
      // address answer exactly like a new one, so sign-up can't be used to find accounts.
      requireEmailVerification: true,
      autoSignIn: false,
      // Better Auth's links go to its own GET endpoints; ours go to the web app, which only
      // acts when the person clicks (see email/templates.ts).
      sendResetPassword: async ({ user, token }) => {
        await deliver(emails.resetPassword(user.email, web, token));
      },
      resetPasswordTokenExpiresIn: LINK_LIFETIME_SECONDS,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        await notify(emails.passwordChanged(user.email, web));
      },
      onExistingUserSignUp: async ({ user }) => {
        await deliver(emails.existingAccount(user.email, web));
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, token }) => {
        // Sign-up (and sign-in while unverified) tokens confirm the address; a
        // change-email-verification token goes to the new address (`user.email` is already it).
        const message =
          tokenRequestType(token) === "change-email-verification"
            ? emails.changeEmailVerify(user.email, web, token)
            : emails.verifyEmail(user.email, web, token);
        await deliver(message);
      },
      sendOnSignUp: true,
      sendOnSignIn: true,
      // Confirming proves the inbox, not the password: sign in afterwards as usual.
      autoSignInAfterVerification: false,
      expiresIn: LINK_LIFETIME_SECONDS,
    },
    user: {
      changeEmail: {
        enabled: true,
        // A verified account's current address approves the change before the new one is
        // asked to confirm it. Clients reach this through POST /v1/me/email, which checks the
        // password first; the endpoint itself is blocked in app.ts.
        sendChangeEmailConfirmation: async ({ user, newEmail, token }) => {
          await deliver(emails.changeEmailConfirm(user.email, newEmail, web, token));
        },
      },
    },
    // Reset tokens are stored as hashes: a leaked database row can't be used to reset a password.
    verification: { storeIdentifier: "hashed" },
    rateLimit: {
      enabled: options.rateLimit ?? env.NODE_ENV !== "test",
      storage: "database",
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        if (returned instanceof Error) return;
        if (ctx.path === "/change-password") {
          const user = ctx.context.session?.user;
          if (user) await notify(emails.passwordChanged(user.email, web));
        }
        // The session cookie is httpOnly so scripts can't read it; don't hand the same token to
        // the browser in /get-session's JSON. Server-side calls (no request) keep it.
        if (
          ctx.path === "/get-session" &&
          ctx.request &&
          returned &&
          typeof returned === "object"
        ) {
          const body = returned as { session?: Record<string, unknown> | null };
          if (body.session) {
            const { token: _token, ...session } = body.session;
            return ctx.json({ ...body, session });
          }
        }
      }),
    },
    advanced: {
      database: { generateId: () => newId() },
      ipAddress: {
        trustedProxies: env.TRUSTED_PROXIES?.split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
    },
    telemetry: { enabled: false },
    plugins: [
      // Refuses passwords found in known breaches (sign-up, change, reset). Only the first five
      // characters of the password's SHA-1 leave the server. Off in tests: it calls the network.
      haveIBeenPwned({ enabled: env.NODE_ENV !== "test" }),
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
