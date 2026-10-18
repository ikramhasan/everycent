import type { Database } from "@everycent/db";
import type { Env } from "./env";
import type { Auth } from "./lib/auth";
import type { ChangeBus } from "./lib/change-bus";
import type { EmailSender } from "./lib/email/sender";
import type { FxProvider } from "./lib/fx/providers";
import type { Jobs } from "./lib/jobs";
import type { ObjectStorage } from "./lib/storage";
import type { YnabClient } from "./lib/ynab/client";

/** Everything a request handler may need. Injected once in createApp; read via c.var.deps. */
export interface AppDeps {
  db: Database;
  env: Env;
  auth: Auth;
  /** Budget change notifications for live updates (`GET …/events`). */
  changes: ChangeBus;
  /**
   * Sends an email now. Request code queues emails instead (`deliverEmail`); the worker calls this.
   * Null when the server sends no email (`createEmailSender`).
   */
  email: EmailSender | null;
  /** Background jobs (pg-boss). */
  jobs: Jobs;
  /** Exchange-rate providers, tried in order (tests use an in-memory fake). */
  fxProviders: FxProvider[];
  /** Where transaction attachments are kept; null turns attachments off (`createStorage`). */
  storage: ObjectStorage | null;
  /**
   * The server's date (YYYY-MM-DD) that a user's `today` is held near before it enters scheduled
   * transactions; null leaves it unbounded. Defaults to the real UTC date (tests set their own).
   */
  serverDate?: () => string | null;
  /** Reads plans from YNAB's API for the importer; tests pass one over a fake `fetch`. */
  ynab?: YnabClient;
}

export type AppEnv = {
  Variables: {
    deps: AppDeps;
    /** Set by hono/request-id for every request. */
    requestId: string;
  };
};
