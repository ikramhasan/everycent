import type { QueueOptions } from "pg-boss";

/**
 * Every background queue and its retry and retention policy. `installJobs` creates (or updates)
 * them on deploy, so a queue added here exists before any code sends to it.
 */
export const QUEUES = {
  /** One email, sealed (`lib/sealed.ts`): links carry sign-in and reset tokens. */
  "email.send": {
    retryLimit: 8,
    retryDelay: 30,
    retryBackoff: true,
    retryDelayMax: 60 * 60,
    expireInSeconds: 60,
    // Sent emails don't stay around; a failed one is kept a week for inspection, still sealed.
    deleteAfterSeconds: 60,
    retentionSeconds: 7 * 24 * 60 * 60,
  },
} as const satisfies Record<string, QueueOptions>;

export type QueueName = keyof typeof QUEUES;

/** What each queue's jobs carry. */
export interface JobData {
  "email.send": { sealed: string };
}
