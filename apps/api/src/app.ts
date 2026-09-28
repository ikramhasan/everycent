import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { registerDocs } from "./lib/docs";
import { notFound, onError } from "./lib/errors";
import { createRouter } from "./lib/router";
import { healthRouter } from "./routes/health";
import type { AppDeps } from "./types";

export function createApp(deps: AppDeps) {
  const app = createRouter();

  app.use("*", requestId());
  if (deps.env.NODE_ENV !== "test") app.use("*", logger());
  app.use("*", secureHeaders());
  app.use("*", cors({ origin: deps.env.WEB_ORIGIN, credentials: true }));
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  app.onError(onError);
  app.notFound(notFound);

  app.route("/v1", healthRouter);

  registerDocs(app);
  return app;
}

export type App = ReturnType<typeof createApp>;
