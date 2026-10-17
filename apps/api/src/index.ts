import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { parseEnv } from "./env";
import { loadRootEnv } from "./load-env";
import { createRuntime } from "./runtime";

if (process.env.NODE_ENV !== "production") loadRootEnv();

const env = parseEnv();
const runtime = await createRuntime(env, { worker: env.JOBS_MODE === "all" });
const app = createApp(runtime.deps);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`everycent API on http://localhost:${info.port} — docs at /docs`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await runtime.close();
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
