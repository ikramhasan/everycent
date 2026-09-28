import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";

export const HealthSchema = z
  .object({ status: z.literal("ok"), database: z.literal("ok") })
  .openapi("Health");

export const getHealth = createRoute({
  method: "get",
  path: "/health",
  operationId: "getHealth",
  tags: ["System"],
  summary: "Service health",
  responses: {
    200: {
      description: "The API and its database are healthy",
      content: { "application/json": { schema: HealthSchema } },
    },
    503: jsonError("The database is unreachable"),
  },
});
