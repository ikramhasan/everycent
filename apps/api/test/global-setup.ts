import { createDb, runMigrations, sql } from "@everycent/db";
import { loadRootEnv } from "../src/load-env";
import { TEST_WORKERS, workerDatabaseUrl } from "./worker-db";

export default async function setup() {
  loadRootEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  await runMigrations(url);
  // Each test worker gets a fresh copy of the migrated database, so files can run in parallel.
  // Connect to `postgres`: copying a database needs no other session on it.
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const { db, close } = createDb(admin.toString(), { max: 1 });
  try {
    const template = new URL(url).pathname.slice(1);
    for (let worker = 1; worker <= TEST_WORKERS; worker++) {
      const name = new URL(workerDatabaseUrl(url, worker)).pathname.slice(1);
      await db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
      await db.execute(sql.raw(`CREATE DATABASE "${name}" TEMPLATE "${template}"`));
    }
  } finally {
    await close();
  }
}
