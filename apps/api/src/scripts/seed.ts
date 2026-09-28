import { createDb } from "@everycent/db";
import { user } from "@everycent/db/schema";
import { eq } from "drizzle-orm";
import { parseEnv } from "../env";
import { createAuth } from "../lib/auth";
import { loadRootEnv } from "../load-env";

const DEMO = { email: "demo@everycent.dev", password: "everycent-demo", name: "Demo User" };

loadRootEnv();
const env = parseEnv();
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });

try {
  const existing = await db.query.user.findFirst({ where: eq(user.email, DEMO.email) });
  if (existing) {
    console.log(`Demo user already exists: ${DEMO.email}`);
  } else {
    await createAuth(db, env).api.signUpEmail({ body: DEMO });
    console.log(`Created demo user ${DEMO.email} / ${DEMO.password}`);
  }
} finally {
  await close();
}
