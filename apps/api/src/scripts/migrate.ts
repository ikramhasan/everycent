import { runMigrations } from "@everycent/db";
import { installJobs } from "../lib/jobs/install";
import { loadRootEnv } from "../load-env";

/**
 * The deploy step: database migrations, then the job queue's schema and queues. Run it once per
 * release before the new version starts (`pnpm db:migrate`; in the image, `node dist/migrate.mjs`).
 */
if (process.env.NODE_ENV !== "production") loadRootEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

await runMigrations(url);
await installJobs(url);
console.log("Migrations applied");
