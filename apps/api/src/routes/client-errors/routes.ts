import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";

export const ClientErrorSchema = z
  .object({
    message: z.string().min(1).max(1000),
    /** The browser's stack, minified (the build's hidden source maps read it). */
    stack: z.string().max(8000).optional(),
    /** The page's path only: query strings and fragments (which carry link tokens) are dropped. */
    path: z.string().max(500).optional(),
  })
  .openapi("ClientError");

export const reportClientError = createRoute({
  method: "post",
  path: "/client-errors",
  operationId: "reportClientError",
  tags: ["System"],
  summary: "Report an error from the web app",
  description:
    "Logs an uncaught error from the browser with the API's own logs (and OpenTelemetry, when configured). No session needed: errors before sign-in count too. Limited per client.",
  request: { body: { content: { "application/json": { schema: ClientErrorSchema } } } },
  responses: {
    204: { description: "Logged (or dropped past the limit)" },
    400: jsonError("The report isn't valid"),
  },
});
