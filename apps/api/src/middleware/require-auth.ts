import { createMiddleware } from "hono/factory";
import type { AgentActor } from "../lib/agents/principal";
import { principalFromEnv } from "../lib/agents/principal";
import { inRequestTransaction } from "../lib/audit-context";
import type { AuthSession, AuthUser } from "../lib/auth";
import { AppError } from "../lib/errors";
import { viewerGuard } from "../lib/viewer-guard";
import type { AppEnv } from "../types";

export type AuthedEnv = {
  Variables: {
    user: AuthUser;
    /** The browser session; null for an agent's request. */
    session: AuthSession | null;
    /** The agent making the request for `user` (MCP client or Agent Auth agent); null for the user. */
    agent: AgentActor | null;
  };
};

/**
 * Rejects the request with 401 unless it carries a valid Better Auth session, and with 403
 * EMAIL_NOT_VERIFIED for an account whose address isn't confirmed. Sign-in already refuses those,
 * so this only catches sessions from before verification was required. A write request then runs
 * in one transaction logged as the user's (`inRequestTransaction`), unless it's a viewer's write to
 * their budget (`viewerGuard`).
 *
 * An agent's request comes from inside the server (`AgentRuntime.run`, after the MCP endpoint or
 * Agent Auth verified the agent), with its principal in the request's environment: it runs as its
 * user, and its changes are logged as the agent's on their behalf.
 */
export const requireAuth = createMiddleware<AppEnv & AuthedEnv>(async (c, next) => {
  const principal = principalFromEnv(c.env);
  if (principal) {
    c.set("user", principal.user);
    c.set("session", null);
    c.set("agent", principal.agent);
    await viewerGuard(c);
    await inRequestTransaction(c, next);
    return;
  }
  const result = await c.var.deps.auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  if (!result.user.emailVerified) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Confirm your email address to continue");
  }
  c.set("user", result.user);
  c.set("session", result.session);
  c.set("agent", null);
  await viewerGuard(c);
  await inRequestTransaction(c, next);
});
