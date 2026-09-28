import { existsSync } from "node:fs";

/** Loads the monorepo root `.env` in development/test. Existing env vars win. */
export function loadRootEnv(): void {
  const file = new URL("../../../.env", import.meta.url);
  if (existsSync(file)) process.loadEnvFile(file);
}
