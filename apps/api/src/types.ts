import type { Database } from "@everycent/db";
import type { Env } from "./env";
import type { Auth } from "./lib/auth";

/** Everything a request handler may need. Injected once in createApp; read via c.var.deps. */
export interface AppDeps {
  db: Database;
  env: Env;
  auth: Auth;
  /**
   * The server's date (YYYY-MM-DD) that a user's `today` is held near before it enters scheduled
   * transactions; null leaves it unbounded. Defaults to the real UTC date (tests set their own).
   */
  serverDate?: () => string | null;
}

export type AppEnv = {
  Variables: {
    deps: AppDeps;
  };
};
