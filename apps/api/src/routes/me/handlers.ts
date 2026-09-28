import type { RouteHandler } from "@hono/zod-openapi";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type { getMe } from "./routes";

export const getMeHandler: RouteHandler<typeof getMe, AppEnv & AuthedEnv> = (c) => {
  const user = c.var.user;
  return c.json(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image ?? null,
      createdAt: user.createdAt.toISOString(),
    },
    200,
  );
};
