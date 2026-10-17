import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { transaction } from "./account";
import { budget } from "./budget";
import { timestamps } from "./columns";

/**
 * A transaction's attachment (YNAB's transaction photo, plus PDFs; EVERYCENT-31): one per
 * transaction, and one per transfer, shared by its two sides (it hangs off the side it was added
 * on). The file itself is in object storage under `storageKey`.
 */
export const transactionAttachment = pgTable(
  "transaction_attachment",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    transactionId: text()
      .notNull()
      .references(() => transaction.id, { onDelete: "cascade" }),
    /** Where the file is in object storage; queued for deletion with the row (`storage_deletion`). */
    storageKey: text().notNull(),
    /** As uploaded, for downloads. */
    fileName: text().notNull(),
    contentType: text().notNull(),
    byteSize: integer().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("transaction_attachment_transaction_idx").on(t.transactionId)],
);

/**
 * Objects to delete from storage. A trigger adds a deleted attachment's key in the same database
 * transaction, however the row went (its transaction, account, budget or user deleted), so a
 * rolled-back delete keeps its file; the `storage.purge` job deletes them and their rows.
 */
export const storageDeletion = pgTable("storage_deletion", {
  storageKey: text().primaryKey(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
