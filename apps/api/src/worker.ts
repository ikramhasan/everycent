import { parseEnv } from "./env";
import { loadRootEnv } from "./load-env";
import { createRuntime } from "./runtime";

/**
 * Runs background jobs without serving HTTP, for deployments that set `JOBS_MODE=api` on the API
 * and run this as its own process.
 */
if (process.env.NODE_ENV !== "production") loadRootEnv();

const runtime = await createRuntime(parseEnv(), { worker: true });
console.log("everycent worker running");

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  await runtime.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
