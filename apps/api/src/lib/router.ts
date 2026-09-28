import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../types";
import { errorBody } from "./errors";

/** Every router in the API must be created here so validation errors share one shape. */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
          code: issue.code,
        }));
        return c.json(errorBody("VALIDATION_ERROR", "Request validation failed", details), 400);
      }
    },
  });
}
