import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export interface CreateDbOptions {
  /** Max pool size. Default 10. */
  max?: number;
}

/**
 * Creates a Drizzle client. postgres.js connects lazily, so this never touches the network
 * until the first query (the OpenAPI emit script relies on that).
 */
export function createDb(url: string, { max = 10 }: CreateDbOptions = {}) {
  const client = postgres(url, { max, onnotice: () => {} });
  const db = drizzle({ client, schema, casing: "snake_case" });
  return { db, close: () => client.end({ timeout: 5 }) };
}

export type Database = ReturnType<typeof createDb>["db"];
