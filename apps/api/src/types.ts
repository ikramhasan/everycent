import type { Database } from "@everycent/db";
import type { Env } from "./env";
import type { Auth } from "./lib/auth";

/** Everything a request handler may need. Injected once in createApp; read via c.var.deps. */
export interface AppDeps {
  db: Database;
  env: Env;
  auth: Auth;
}

export type AppEnv = {
  Variables: {
    deps: AppDeps;
  };
};
