import type { RouteHandler } from "@hono/zod-openapi";
import { log } from "../../lib/log";
import { tryClientErrorReport } from "../../lib/throttle";
import type { AppEnv } from "../../types";
import type { reportClientError } from "./routes";

export const reportClientErrorHandler: RouteHandler<typeof reportClientError, AppEnv> = async (
  c,
) => {
  const { message, stack, path } = c.req.valid("json");
  // Keyed by the first forwarded hop: spoofable, but a spoofer only fills the log faster, and a
  // global cap bounds that too.
  const client = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "direct";
  if (await tryClientErrorReport(c.var.deps.db, client)) {
    log.error("Web app error", {
      source: "web",
      requestId: c.get("requestId"),
      path: path?.split(/[?#]/)[0],
      "exception.message": message,
      "exception.stacktrace": stack,
    });
  }
  return c.body(null, 204);
};
