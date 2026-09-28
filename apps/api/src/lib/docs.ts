import type { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import type { AppEnv } from "../types";

export const OPENAPI_CONFIG = {
  openapi: "3.1.0",
  info: {
    title: "everycent API",
    version: "0.1.0",
    description:
      "Zero-based budgeting API. Money amounts are integer strings in the currency's minor units.",
  },
} as const;

export function registerDocs(app: OpenAPIHono<AppEnv>): void {
  app.openAPIRegistry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description: "Session cookie set by the Better Auth endpoints under /api/auth",
  });

  app.doc31("/openapi.json", OPENAPI_CONFIG);
  app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "everycent API" }));
}

export function buildOpenApiDocument(app: OpenAPIHono<AppEnv>) {
  return app.getOpenAPI31Document(OPENAPI_CONFIG);
}
