import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { registerDocs } from "./lib/docs";
import { notFound, onError } from "./lib/errors";
import { createRouter } from "./lib/router";
import { accountsRouter } from "./routes/accounts";
import { activityRouter } from "./routes/activity";
import { budgetsRouter } from "./routes/budgets";
import { categoriesRouter } from "./routes/categories";
import { categoryTemplatesRouter } from "./routes/category-templates";
import { eventsRouter } from "./routes/events";
import { exportsRouter } from "./routes/exports";
import { flagsRouter } from "./routes/flags";
import { fxRatesRouter } from "./routes/fx-rates";
import { healthRouter } from "./routes/health";
import { meRouter } from "./routes/me";
import { membersRouter } from "./routes/members";
import { monthsRouter } from "./routes/months";
import { payeesRouter } from "./routes/payees";
import { reportsRouter } from "./routes/reports";
import { scheduledRouter } from "./routes/scheduled";
import { transactionsRouter } from "./routes/transactions";
import { viewsRouter } from "./routes/views";
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
  // Replaced by /v1/me routes: change-email needs the current password there, and the session
  // routes return ids instead of the raw session tokens these endpoints hand to the browser.
  for (const path of [
    "/api/auth/change-email",
    "/api/auth/list-sessions",
    "/api/auth/revoke-session",
    "/api/auth/revoke-sessions",
    "/api/auth/revoke-other-sessions",
    // Two-step verification: set up with /two-factor/enable + /verify-totp, signed in with
    // /verify-totp or /verify-backup-code. Turning it off is /v1/me/two-factor (a code, as YNAB
    // asks); YNAB has no email codes or regenerated backup codes.
    "/api/auth/two-factor/disable",
    "/api/auth/two-factor/send-otp",
    "/api/auth/two-factor/verify-otp",
    "/api/auth/two-factor/generate-backup-codes",
  ]) {
    app.all(path, notFound);
  }
  app.on(["GET", "POST"], "/api/auth/*", (c) => c.var.deps.auth.handler(c.req.raw));

  app.route("/v1", healthRouter);
  app.route("/v1", meRouter);
  app.route("/v1", budgetsRouter);
  app.route("/v1", membersRouter);
  app.route("/v1", categoriesRouter);
  app.route("/v1", categoryTemplatesRouter);
  app.route("/v1", accountsRouter);
  app.route("/v1", transactionsRouter);
  app.route("/v1", payeesRouter);
  app.route("/v1", scheduledRouter);
  app.route("/v1", flagsRouter);
  app.route("/v1", viewsRouter);
  app.route("/v1", monthsRouter);
  app.route("/v1", fxRatesRouter);
  app.route("/v1", activityRouter);
  app.route("/v1", reportsRouter);
  app.route("/v1", eventsRouter);
  app.route("/v1", exportsRouter);

  registerDocs(app);
  return app;
}

export type App = ReturnType<typeof createApp>;
