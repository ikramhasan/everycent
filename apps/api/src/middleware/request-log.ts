import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import { log } from "../lib/log";
import type { AppEnv } from "../types";

const BUDGET_ID = /^\/v1\/budgets\/([^/]+)/;

/**
 * One structured line per request (EVERYCENT-106): method, the matched route pattern (not the
 * raw path, which carries ids), status, latency, request id, and the budget it touched. Nothing
 * from the body or query: no amounts, names or emails.
 */
export const requestLog = createMiddleware<AppEnv>(async (c, next) => {
  const started = performance.now();
  await next();
  const budgetId = BUDGET_ID.exec(c.req.path)?.[1];
  log.info("request", {
    method: c.req.method,
    route: routePath(c),
    status: c.res.status,
    durationMs: Math.round(performance.now() - started),
    requestId: c.get("requestId"),
    budgetId: budgetId === "import" ? undefined : budgetId,
  });
});
