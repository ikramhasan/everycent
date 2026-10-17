import type { RouteHandler } from "@hono/zod-openapi";
import { log } from "../../lib/log";
import { tryClientErrorReport } from "../../lib/throttle";
import type { AppEnv } from "../../types";
import type { reportClientError } from "./routes";

/**
 * A browser's message can quote what the person typed or saw (a payee, a memo, an amount). Logs
 * keep ids and codes only, so quoted text and numbers outside code positions are masked; stack
 * frames keep their `file:line:column`.
 */
export function scrub(text: string): string {
  return text
    .replace(/(["'`])(?:(?!\1).){1,200}\1/g, "$1…$1")
    .replace(/(?<![\w:/.-])[$€£]?\d[\d,.]*/g, "#");
}

export const reportClientErrorHandler: RouteHandler<typeof reportClientError, AppEnv> = async (
  c,
) => {
  const { message, stack, path } = c.req.valid("json");
  // Keyed like Better Auth's limits: the host's client IP header (CLIENT_IP_HEADER), else the
  // first forwarded hop. That one is spoofable, but a spoofer only fills the log faster, and a
  // global cap bounds that too.
  const header = c.var.deps.env.CLIENT_IP_HEADER ?? "x-forwarded-for";
  const client = c.req.header(header)?.split(",")[0]?.trim() || "direct";
  if (await tryClientErrorReport(c.var.deps.db, client)) {
    log.error("Web app error", {
      source: "web",
      requestId: c.get("requestId"),
      path: path?.split(/[?#]/)[0],
      "exception.message": scrub(message),
      "exception.stacktrace": stack && scrub(stack),
    });
  }
  return c.body(null, 204);
};
