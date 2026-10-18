import { sendQueuedEmail } from "../email/queue";
import { prefetchFxRates } from "../fx";
import { remindInvitations } from "../invitations";
import { purgeStorage } from "../storage/purge";
import type { JobHandlers } from "./index";

/** The handler for each queue in `QUEUES`. */
export const jobHandlers: JobHandlers = {
  "email.send": sendQueuedEmail,
  "invitations.remind": remindInvitations,
  "fx.prefetch": prefetchFxRates,
  "storage.purge": purgeStorage,
};
