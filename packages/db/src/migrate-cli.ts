import { existsSync } from "node:fs";
import { runMigrations } from "./migrate";

const envFile = new URL("../../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

await runMigrations(url);
console.log("Migrations applied");
