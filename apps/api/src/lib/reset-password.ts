import { randomBytes } from "node:crypto";
import type { Database } from "@everycent/db";
import { account, session, user } from "@everycent/db/schema";
import { and, eq } from "drizzle-orm";
import type { createAuth } from "./auth";

/**
 * Sets a new random password on the account with `email` and signs it out everywhere (what a
 * reset link does). For a server without email, where the person who runs it is the only way back
 * in. Returns the temporary password, or null when no account has that address.
 */
export async function resetPassword(
  db: Database,
  auth: ReturnType<typeof createAuth>,
  email: string,
): Promise<string | null> {
  const found = await db.query.user.findFirst({
    where: eq(user.email, email.trim().toLowerCase()),
  });
  if (!found) return null;
  const temporary = randomBytes(12).toString("base64url");
  const hash = await (await auth.$context).password.hash(temporary);
  await db.transaction(async (tx) => {
    await tx
      .update(account)
      .set({ password: hash })
      .where(and(eq(account.userId, found.id), eq(account.providerId, "credential")));
    await tx.delete(session).where(eq(session.userId, found.id));
  });
  return temporary;
}
