import { fileURLToPath } from "node:url";
import { createDb } from "@everycent/db";
import { createApp } from "./app";
import { parseEnv } from "./env";
import { createAuth } from "./lib/auth";
import { buildOpenApiDocument } from "./lib/docs";

export const OPENAPI_FILE = fileURLToPath(new URL("../openapi.json", import.meta.url));

/**
 * Builds the OpenAPI document from a fully wired app without any real config or DB access
 * (postgres.js connects lazily, and building the doc never queries).
 */
export function generateOpenApiDocument() {
  const env = parseEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://spec:spec@127.0.0.1:1/spec",
    BETTER_AUTH_SECRET: "openapi-spec-generation-placeholder-secret",
    BETTER_AUTH_URL: "http://localhost:3000",
    WEB_ORIGIN: "http://localhost:5173",
  });
  const { db } = createDb(env.DATABASE_URL, { max: 1 });
  return buildOpenApiDocument(createApp({ db, env, auth: createAuth(db, env) }));
}

export function serializeOpenApi(doc: unknown): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
