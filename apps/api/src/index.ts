import { createDb } from "@everycent/db";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { parseEnv } from "./env";
import { loadRootEnv } from "./load-env";

if (process.env.NODE_ENV !== "production") loadRootEnv();

const env = parseEnv();
const { db, close } = createDb(env.DATABASE_URL);
const app = createApp({ db, env });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`everycent API on http://localhost:${info.port} — docs at /docs`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await close();
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
