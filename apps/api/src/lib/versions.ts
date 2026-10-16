import { auditEvent, transaction, user } from "@everycent/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AppError } from "./errors";
import type { Db } from "./ledger";

/**
 * Preconditions for undo and redo (EVERYCENT-36): an inverse replays a row as it was, so a
 * partner's later change to the same row would be overwritten. Undo sends the version it saw
 * (`expectedVersion`; `expectedAssigned` for an assigned amount) and a changed row is refused.
 */

/** 409 STALE_VERSION, naming who changed the row last. */
export async function staleVersion(
  db: Db,
  changedBy: string | null,
  actorId: string,
  what: string,
): Promise<AppError> {
  let who = "Someone";
  if (changedBy === actorId) who = "You";
  else if (changedBy) {
    const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, changedBy));
    if (row?.name) who = row.name;
  }
  return new AppError(
    409,
    "STALE_VERSION",
    `${who} changed this ${what} since, so it wasn't changed back.`,
  );
}

/** Locks the transactions and refuses if any isn't at the version expected. */
export async function assertTransactionVersions(
  tx: Db,
  budgetId: string,
  expected: Readonly<Record<string, number>> | undefined,
  actorId: string,
): Promise<void> {
  const ids = Object.keys(expected ?? {});
  if (!expected || ids.length === 0) return;
  const rows = await tx
    .select({
      id: transaction.id,
      version: transaction.version,
      updatedBy: transaction.updatedByUserId,
    })
    .from(transaction)
    .where(and(eq(transaction.budgetId, budgetId), inArray(transaction.id, ids)))
    .orderBy(transaction.id)
    .for("update");
  for (const row of rows) {
    if (row.version !== expected[row.id]) {
      throw await staleVersion(tx, row.updatedBy, actorId, "transaction");
    }
  }
}

/** Each transaction's version now, for the next undo or redo to send. */
export async function transactionVersions(
  db: Db,
  ids: readonly string[],
): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: transaction.id, version: transaction.version })
    .from(transaction)
    .where(inArray(transaction.id, [...ids]));
  return Object.fromEntries(rows.map((r) => [r.id, r.version]));
}

/** Who last changed a category's assigned amount in a month, from the change log. */
export async function lastAssignedBy(
  db: Db,
  budgetId: string,
  assignmentId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ actor: auditEvent.actorUserId })
    .from(auditEvent)
    .where(
      and(
        eq(auditEvent.budgetId, budgetId),
        eq(auditEvent.tableName, "category_assignment"),
        eq(auditEvent.rowId, assignmentId),
      ),
    )
    .orderBy(desc(auditEvent.createdAt))
    .limit(1);
  return row?.actor ?? null;
}
