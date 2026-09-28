import { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "VALIDATION_ERROR" }),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi("Error");

export type ErrorBody = z.infer<typeof ErrorSchema>;

/** Throw from handlers/middleware for expected failures; rendered by onError. */
export class AppError extends Error {
  override name = "AppError";
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function errorBody(code: string, message: string, details?: unknown): ErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/** OpenAPI response entry for an error status. */
export function jsonError(description: string) {
  return { description, content: { "application/json": { schema: ErrorSchema } } };
}

const STATUS_CODES: Partial<Record<number, string>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
};

export function onError(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json(errorBody(err.code, err.message, err.details), err.status);
  }
  if (err instanceof HTTPException) {
    const code = STATUS_CODES[err.status] ?? "HTTP_ERROR";
    return c.json(errorBody(code, err.message || "Request failed"), err.status);
  }
  console.error(`[${c.get("requestId") ?? "-"}] Unhandled error`, err);
  return c.json(errorBody("INTERNAL_ERROR", "Something went wrong"), 500);
}

export function notFound(c: Context) {
  return c.json(errorBody("NOT_FOUND", `Route ${c.req.method} ${c.req.path} not found`), 404);
}
