import { storageDeletion } from "@everycent/db/schema";
import { asc, inArray } from "drizzle-orm";
import type { JobHandler } from "../jobs";
import { log } from "../log";

/** Keys deleted per round. */
const BATCH = 500;

/**
 * Deletes the files of deleted attachments (queued in `storage_deletion` by a trigger) from object
 * storage, then their queue rows. Deleting is idempotent, so a key two runs both take is fine.
 * Without storage (attachments off), the queue waits for it.
 */
export const purgeStorage: JobHandler<"storage.purge"> = async ({ db, storage }) => {
  if (!storage) return;
  for (;;) {
    const rows = await db
      .select({ key: storageDeletion.storageKey })
      .from(storageDeletion)
      .orderBy(asc(storageDeletion.createdAt))
      .limit(BATCH);
    if (rows.length === 0) return;
    const keys = rows.map((r) => r.key);
    await storage.delete(keys);
    await db.delete(storageDeletion).where(inArray(storageDeletion.storageKey, keys));
    log.info("Deleted stored files", { count: keys.length });
    if (rows.length < BATCH) return;
  }
};
