import { createDb, type Database, sql } from "@everycent/db";
import { createApp } from "../src/app";
import { type Env, parseEnv } from "../src/env";
import { loadRootEnv } from "../src/load-env";

export function testEnv(): Env {
  loadRootEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  return parseEnv({
    NODE_ENV: "test",
    DATABASE_URL: url,
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-chars-long",
    BETTER_AUTH_URL: "http://localhost:3000",
    WEB_ORIGIN: "http://localhost:5173",
  });
}

export function createTestApp() {
  const env = testEnv();
  const { db, close } = createDb(env.DATABASE_URL, { max: 2 });
  const app = createApp({ db, env });
  return { app, db, env, close };
}

/** Empties every table in the public schema (future tables included automatically). */
export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
}
