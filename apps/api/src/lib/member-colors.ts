import { budgetMember } from "@everycent/db/schema";
import { z } from "@hono/zod-openapi";
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "./ledger";

/**
 * YNAB's six member avatar colours, 1-based (avatar-one … avatar-six). YNAB's client (checked
 * 2026-10-16 on a shared plan, EVERYCENT-166) gives the manager avatar-one and every other member
 * the next of avatar-two … avatar-six in member-list order, avatar-six once they run out. A budget
 * here has at most six people, so the owner gets 1 and the others 2–6 by when they joined.
 */
export const zAvatarColor = z
  .number()
  .int()
  .min(1)
  .max(6)
  .describe(
    "YNAB's member avatar colour, 1–6: the owner is 1, the others 2–6 in the order they joined",
  );

/** Each current member's avatar colour, by user id. */
export async function memberAvatarColors(db: Db, budgetId: string): Promise<Map<string, number>> {
  const members = await db
    .select({ userId: budgetMember.userId })
    .from(budgetMember)
    .where(eq(budgetMember.budgetId, budgetId))
    .orderBy(sql`${budgetMember.role} <> 'owner'`, asc(budgetMember.createdAt));
  return new Map(members.map((m, i) => [m.userId, Math.min(i + 1, 6)]));
}
