import type { Database } from "@everycent/db";
import type { Env } from "./env";

/** Everything a request handler may need. Injected once in createApp; read via c.var.deps. */
export interface AppDeps {
  db: Database;
  env: Env;
}

export type AppEnv = {
  Variables: {
    deps: AppDeps;
  };
};
