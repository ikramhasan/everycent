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

/** Password checks on our own routes (Better Auth's limiter only covers its endpoints). */
export const PASSWORD_CHECKS_PER_HOUR = 10;

/**
 * Counts one password check for `userId`; throws 429 RATE_LIMITED past the hourly limit, so a
 * stolen session can't be used to guess the account's password.
 */
export async function consumePasswordCheck(db: Database, userId: string) {
  try {
    await limiter(db, "password-check", PASSWORD_CHECKS_PER_HOUR, 60 * 60).consume(userId);
  } catch (e) {
    if (!(e instanceof RateLimiterRes)) throw e;
    throw new AppError(429, "RATE_LIMITED", "Too many attempts. Try again later.", {
      retryAfterSeconds: Math.ceil(e.msBeforeNext / 1000),
    });
  }
}
