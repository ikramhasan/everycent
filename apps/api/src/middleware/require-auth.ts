import { createMiddleware } from "hono/factory";
import type { AuthSession, AuthUser } from "../lib/auth";
import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

export type AuthedEnv = {
  Variables: {
    user: AuthUser;
    session: AuthSession;
  };
};

/**
 * Rejects the request with 401 unless it carries a valid Better Auth session, and with 403
 * EMAIL_NOT_VERIFIED for an account whose address isn't confirmed. Sign-in already refuses those,
 * so this only catches sessions from before verification was required.
 */
export const requireAuth = createMiddleware<AppEnv & AuthedEnv>(async (c, next) => {
  const result = await c.var.deps.auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  if (!result.user.emailVerified) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Confirm your email address to continue");
  }
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
});
