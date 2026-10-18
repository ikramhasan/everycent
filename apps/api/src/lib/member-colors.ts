import { budgetMember, user, userAvatar } from "@everycent/db/schema";
import { z } from "@hono/zod-openapi";
import { asc, eq, inArray, type SQL, sql } from "drizzle-orm";
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

/** A user's profile picture URL (EVERYCENT-229), shown as a circle; null without one. */
export const zPicture = z
  .string()
  .nullable()
  .describe("Their profile picture's URL (an API path); null without one");

/**
 * A user's profile picture URL, built from their `user_avatar` row (`/v1/users/{id}/picture?v=`,
 * as `profilePictureUrl` writes it). Never `user.image`: Better Auth's own endpoints accept any
 * string there, and other members' browsers would load it (PR #19 review).
 */
export function pictureUrlSql(userId: SQL | typeof user.id): SQL<string | null> {
  return sql<
    string | null
  >`(select '/v1/users/' || ${userAvatar.userId} || '/picture?v=' || ${userAvatar.id}
    from ${userAvatar} where ${userAvatar.userId} = ${userId})`;
}

/** Someone who made a change: an audit event's actor, who entered or changed a transaction. */
export const zMemberRef = z
  .object({
    userId: z.string(),
    name: z.string().nullable().describe("Null once their user is deleted"),
    avatarColor: zAvatarColor.nullable().describe("Null once they've left the budget"),
    picture: zPicture,
  })
  .openapi("MemberRef");

/** Each user id's name and avatar colour on the budget, for `zMemberRef`s. */
export async function memberRefs(db: Db, budgetId: string, userIds: Iterable<string | null>) {
  const ids = [...new Set([...userIds].filter((id): id is string => Boolean(id)))];
  const colors = await memberAvatarColors(db, budgetId);
  const names = ids.length
    ? await db
        .select({ id: user.id, name: user.name, picture: pictureUrlSql(user.id) })
        .from(user)
        .where(inArray(user.id, ids))
    : [];
  const byId = new Map(names.map((n) => [n.id, n]));
  return (userId: string | null) =>
    userId
      ? {
          userId,
          name: byId.get(userId)?.name ?? null,
          avatarColor: colors.get(userId) ?? null,
          picture: byId.get(userId)?.picture ?? null,
        }
      : null;
}

/** Each current member's avatar colour, by user id. */
export async function memberAvatarColors(db: Db, budgetId: string): Promise<Map<string, number>> {
  const members = await db
    .select({ userId: budgetMember.userId })
    .from(budgetMember)
    .where(eq(budgetMember.budgetId, budgetId))
    .orderBy(sql`${budgetMember.role} <> 'owner'`, asc(budgetMember.createdAt));
  return new Map(members.map((m, i) => [m.userId, Math.min(i + 1, 6)]));
}
