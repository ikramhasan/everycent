import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";

export const UserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    image: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("User");

export const getMe = createRoute({
  method: "get",
  path: "/me",
  operationId: "getMe",
  tags: ["Users"],
  summary: "The signed-in user",
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: "The current user",
      content: { "application/json": { schema: UserSchema } },
    },
    401: jsonError("Not signed in"),
  },
});
