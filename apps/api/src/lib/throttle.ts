import type { Database } from "@everycent/db";
import { throttle } from "@everycent/db/schema";
import { RateLimiterDrizzle, RateLimiterRes } from "rate-limiter-flexible";
import { AppError } from "./errors";

const limiters = new WeakMap<Database, Map<string, RateLimiterDrizzle>>();

function limiter(db: Database, keyPrefix: string, points: number, seconds: number) {
  let byPrefix = limiters.get(db);
  if (!byPrefix) {
    byPrefix = new Map();
    limiters.set(db, byPrefix);
  }
  let found = byPrefix.get(keyPrefix);
  if (!found) {
    found = new RateLimiterDrizzle({
      storeClient: db,
      schema: throttle,
      keyPrefix,
      points,
      duration: seconds,
    });
    byPrefix.set(keyPrefix, found);
  }
  return found;
}

/** Password checks per user per hour, across every route that checks the current password. */
export const PASSWORD_CHECKS_PER_HOUR = 10;

/**
 * Counts one current-password check for `userId` (change email, change password). Returns the
 * seconds to wait once the hourly limit is spent, else null. Better Auth's own limiter is per IP,
 * so this is what stops a stolen session from being used to guess the account's password.
 */
export async function tryPasswordCheck(db: Database, userId: string): Promise<number | null> {
  try {
    await limiter(db, "password-check", PASSWORD_CHECKS_PER_HOUR, 60 * 60).consume(userId);
    return null;
  } catch (e) {
    if (!(e instanceof RateLimiterRes)) throw e;
    return Math.ceil(e.msBeforeNext / 1000);
  }
}

/** `tryPasswordCheck` for our routes: throws 429 RATE_LIMITED past the limit. */
export async function consumePasswordCheck(db: Database, userId: string) {
  const retryAfterSeconds = await tryPasswordCheck(db, userId);
  if (retryAfterSeconds !== null) {
    throw new AppError(429, "RATE_LIMITED", "Too many attempts. Try again later.", {
      retryAfterSeconds,
    });
  }
}

/** Web app error reports per client per 10 minutes, and in all per hour. */
export const CLIENT_ERRORS_PER_CLIENT = 20;
export const CLIENT_ERRORS_PER_HOUR = 600;

/** Counts one web app error report; false once the client's or everyone's limit is spent. */
export async function tryClientErrorReport(db: Database, client: string): Promise<boolean> {
  try {
    await limiter(db, "client-error", CLIENT_ERRORS_PER_CLIENT, 10 * 60).consume(client);
    await limiter(db, "client-errors-all", CLIENT_ERRORS_PER_HOUR, 60 * 60).consume("all");
    return true;
  } catch (e) {
    if (!(e instanceof RateLimiterRes)) throw e;
    return false;
  }
}
