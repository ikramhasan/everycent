import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { type AgentActor, principalFromEnv } from "../lib/agents/principal";
import {
  apiKeyFromHeaders,
  keyAllowsBudget,
  permissionsToScope,
  type RequestApiKey,
} from "../lib/api-keys";
import { inRequestTransaction } from "../lib/audit-context";
import type { AuthSession, AuthUser } from "../lib/auth";
import { AppError } from "../lib/errors";
import { consumeApiKeyRequest } from "../lib/throttle";
import { BUDGET_PATH, onlyReads, viewerGuard } from "../lib/viewer-guard";
import type { AppEnv } from "../types";

export type AuthedEnv = {
  Variables: {
    user: AuthUser;
    /** The signed-in session; null when the request came with an API key or from an agent. */
    session: AuthSession | null;
    /** The API key the request came with; null for a signed-in session or an agent. */
    apiKey: RequestApiKey | null;
    /** The agent making the request for `user` (MCP client or Agent Auth agent); null otherwise. */
    agent: AgentActor | null;
  };
};

/** OpenAPI security for `requireAuth` routes: a session cookie or an API key. */
export const authSecurity: Record<string, string[]>[] = [{ cookieAuth: [] }, { apiKeyAuth: [] }];
/** OpenAPI security for `requireSession` routes. */
export const sessionSecurity: Record<string, string[]>[] = [{ cookieAuth: [] }];

/**
 * Rejects the request with 401 unless it carries a valid Better Auth session or API key, and with
 * 403 EMAIL_NOT_VERIFIED for an account whose address isn't confirmed. Sign-in already refuses
 * those, so this only catches sessions from before verification was required. A key is held to its
 * scope (`apiKeyGuard`). A write request then runs in one transaction logged as the user's
 * (`inRequestTransaction`), unless it's a viewer's write to their budget (`viewerGuard`).
 *
 * An agent's request comes from inside the server (`AgentRuntime.run`, after the MCP endpoint or
 * Agent Auth verified the agent), with its principal in the request's environment: it runs as its
 * user, and its changes are logged as the agent's on their behalf.
 */
export const requireAuth = createMiddleware<AppEnv & AuthedEnv>(async (c, next) => {
  const principal = principalFromEnv(c.env);
  const key = principal ? null : apiKeyFromHeaders(c.req.raw.headers);
  if (principal) {
    c.set("user", principal.user);
    c.set("session", null);
    c.set("apiKey", null);
    c.set("agent", principal.agent);
  } else if (key !== null) await authenticateApiKey(c, key);
  else await authenticateSession(c);
  await viewerGuard(c);
  await inRequestTransaction(c, next);
});

/**
 * `requireAuth` for account and security routes (email, password, sessions, two-step
 * verification, API keys themselves) and budget-wide changes (creating, deleting and sharing
 * budgets, imports): only a signed-in session, so a leaked key can't take over the account. A
 * request with a key gets 403 SESSION_REQUIRED.
 *
 * Agents act with the person's own approval, for everything the person can do but account
 * security: their in-process requests pass here as their user, and the agent catalog
 * (`lib/agents/operations.ts`) is what keeps them from the security routes.
 */
export const requireSession = createMiddleware<AppEnv & AuthedEnv>(async (c, next) => {
  const principal = principalFromEnv(c.env);
  if (principal) {
    c.set("user", principal.user);
    c.set("session", null);
    c.set("apiKey", null);
    c.set("agent", principal.agent);
  } else {
    if (apiKeyFromHeaders(c.req.raw.headers) !== null) {
      throw new AppError(
        403,
        "SESSION_REQUIRED",
        "API keys can't be used here: sign in to the web app instead",
      );
    }
    await authenticateSession(c);
  }
  await viewerGuard(c);
  await inRequestTransaction(c, next);
});

type AuthContext = Context<AppEnv & AuthedEnv>;

async function authenticateSession(c: AuthContext) {
  const result = await c.var.deps.auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  if (!result.user.emailVerified) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Confirm your email address to continue");
  }
  c.set("user", result.user);
  c.set("session", result.session);
  c.set("apiKey", null);
  c.set("agent", null);
}

async function authenticateApiKey(c: AuthContext, key: string) {
  const { auth, db } = c.var.deps;
  // Answers `valid: false` for an unknown, revoked or expired key (and deletes an expired one).
  const verified = await auth.api.verifyApiKey({ body: { key } });
  const ownerId = verified.valid ? verified.key?.referenceId : undefined;
  const owner = ownerId
    ? await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, ownerId) })
    : undefined;
  if (!verified.key || !owner) {
    throw new AppError(401, "INVALID_API_KEY", "That API key isn't valid, or it has expired");
  }
  if (!owner.emailVerified) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Confirm your email address to continue");
  }
  await consumeApiKeyRequest(db, verified.key.id);
  const apiKey = { id: verified.key.id, ...permissionsToScope(verified.key.permissions) };
  apiKeyGuard(c.req.method, c.req.path, apiKey);
  c.set("user", owner);
  c.set("session", null);
  c.set("apiKey", apiKey);
  c.set("agent", null);
}

/**
 * Holds a key to its scope before the route runs. A key limited to some budgets gets 404 for any
 * other budget, as a non-member would (`loadBudgetAccess` checks again). A read-only key gets 403
 * READ_ONLY_KEY for anything but reads (and the few POSTs that only read).
 */
function apiKeyGuard(method: string, path: string, key: RequestApiKey) {
  const match = BUDGET_PATH.exec(path);
  if (match?.[1] !== undefined && !keyAllowsBudget(key, match[1])) {
    throw new AppError(404, "NOT_FOUND", "Budget not found");
  }
  const reads = method === "GET" || method === "HEAD" || (match && onlyReads(match[2] ?? ""));
  if (!reads && key.access === "read") {
    throw new AppError(403, "READ_ONLY_KEY", "This API key can read but not make changes");
  }
}

/** The session behind a `requireSession` route (never null there). */
export function sessionOf(c: { var: Pick<AuthedEnv["Variables"], "session"> }): AuthSession {
  if (!c.var.session) throw new AppError(403, "SESSION_REQUIRED", "Sign in to the web app instead");
  return c.var.session;
}
