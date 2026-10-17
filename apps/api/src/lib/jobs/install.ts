import { PgBoss } from "pg-boss";
import { log } from "../log";
import { JOBS_SCHEMA } from "./index";
import { QUEUES, type QueueName } from "./queues";

/**
 * Installs or upgrades pg-boss's schema and creates or updates every queue in `QUEUES`. Runs on
 * deploy with the database migrations (`pnpm db:migrate`, the image's migrate step), never on app
 * start, so instances of a new version never race over it.
 */
export async function installJobs(url: string): Promise<void> {
  const boss = new PgBoss({
    connectionString: url,
    max: 1,
    schema: JOBS_SCHEMA,
    migrate: true,
    supervise: false,
    schedule: false,
    registerInstance: false,
  });
  boss.on("error", (error) => log.error("Job queue error", {}, error));
  await boss.start();
  try {
    for (const [name, options] of Object.entries(QUEUES) as [QueueName, object][]) {
      if (await boss.getQueue(name)) await boss.updateQueue(name, options);
      else await boss.createQueue(name, options);
    }
  } finally {
    await boss.stop({ graceful: false });
  }
}
