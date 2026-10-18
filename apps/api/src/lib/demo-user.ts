import { createDb } from "@everycent/db";
import { user } from "@everycent/db/schema";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { createAuth } from "./auth";
import { ConsoleEmailSender } from "./email/sender";

/** The dev and preview sign-in. Public on purpose: it only exists where anyone may use it. */
export const DEMO_USER = {
  email: "demo@everycent.dev",
  password: "everycent-demo",
  name: "Demo User",
};

/** Creates the demo user (already confirmed) unless it exists. Safe to run on every deploy. */
export async function seedDemoUser(env: Env): Promise<"created" | "exists"> {
  const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
  try {
    const existing = await db.query.user.findFirst({ where: eq(user.email, DEMO_USER.email) });
    if (!existing) {
      await createAuth(db, env, new ConsoleEmailSender()).api.signUpEmail({ body: DEMO_USER });
    }
    // No inbox to confirm, so it starts confirmed.
    await db.update(user).set({ emailVerified: true }).where(eq(user.email, DEMO_USER.email));
    return existing ? "exists" : "created";
  } finally {
    await close();
  }
}
