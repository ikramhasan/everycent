import { runMigrations } from "@everycent/db";
import { loadRootEnv } from "../src/load-env";

export default async function setup() {
  loadRootEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  await runMigrations(url);
}
