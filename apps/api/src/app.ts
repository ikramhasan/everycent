import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { registerDocs } from "./lib/docs";
import { notFound, onError } from "./lib/errors";
import { createRouter } from "./lib/router";
import { accountsRouter } from "./routes/accounts";
import { budgetsRouter } from "./routes/budgets";
import { categoriesRouter } from "./routes/categories";
import { flagsRouter } from "./routes/flags";
import { healthRouter } from "./routes/health";
import { meRouter } from "./routes/me";
import { transactionsRouter } from "./routes/transactions";
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

  // Budgets are organization-plugin records, but clients must go through /v1/budgets (our
  // validation, error shape and OpenAPI contract), so the plugin's own endpoints stay hidden.
  app.all("/api/auth/organization/*", notFound);
  app.on(["GET", "POST"], "/api/auth/*", (c) => c.var.deps.auth.handler(c.req.raw));

  app.route("/v1", healthRouter);
  app.route("/v1", meRouter);
  app.route("/v1", budgetsRouter);
  app.route("/v1", categoriesRouter);
  app.route("/v1", accountsRouter);
  app.route("/v1", transactionsRouter);
  app.route("/v1", flagsRouter);

  registerDocs(app);
  return app;
}

export type App = ReturnType<typeof createApp>;
