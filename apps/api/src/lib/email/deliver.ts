import type { AppDeps } from "../../types";
import type { EmailMessage } from "./sender";

/**
 * Sends an email without holding up the response; a failed send is logged, not retried (see
 * `docs/deferred.md`). Tests await it so they can read the outbox straight away.
 */
export async function deliverEmail(deps: AppDeps, message: EmailMessage) {
  if (deps.env.NODE_ENV === "test") return deps.email.send(message);
  void deps.email
    .send(message)
    .catch((e) => console.error(`[email] failed to send a ${message.kind} email`, e));
}
