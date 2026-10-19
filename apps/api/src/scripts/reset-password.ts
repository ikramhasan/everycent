import { createDb } from "@everycent/db";
import { parseEnv } from "../env";
import { createAuth } from "../lib/auth";
import { ConsoleEmailSender } from "../lib/email/sender";
import { resetPassword } from "../lib/reset-password";
import { loadRootEnv } from "../load-env";

/**
 * For a server without email: `node dist/reset-password.mjs <email>` (`pnpm db:reset-password
 * <email>` in the repo) gives the account a temporary password and signs it out everywhere.
 */
if (process.env.NODE_ENV !== "production") loadRootEnv();
const email = process.argv[2];
if (!email) {
  console.error("Usage: reset-password <email>");
  process.exit(1);
}
const env = parseEnv();
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
try {
  const temporary = await resetPassword(db, createAuth(db, env, new ConsoleEmailSender()), email);
  if (!temporary) {
    console.error(`No account has the address ${email}`);
    process.exitCode = 1;
  } else {
    console.log(`Temporary password for ${email}: ${temporary}`);
    console.log("Every session was signed out. Sign in with it, then change it under Settings.");
  }
} finally {
  await close();
}
