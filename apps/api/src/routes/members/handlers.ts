import { createHash, randomBytes } from "node:crypto";
import { newId, sql } from "@everycent/db";
import { budget, budgetInvitation, budgetMember, user } from "@everycent/db/schema";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { loadBudgetAccess } from "../../lib/budget-access";
import { deliverEmail } from "../../lib/email/deliver";
import { emails } from "../../lib/email/templates";
import { AppError } from "../../lib/errors";
import type { Db, Tx } from "../../lib/ledger";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import {
  type acceptInvitation,
  type cancelInvitation,
  type createInvitation,
  INVITATION_DAYS,
  type listMembers,
  MAX_BUDGET_PEOPLE,
  type resendInvitation,
  type viewInvitation,
} from "./routes";

type Env = AppEnv & AuthedEnv;

const MANAGE = { invitation: ["create"] } as const;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A fresh link token (returned once, for the email) and its hash (stored). */
function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

const expiry = () => new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);

type InvitationRow = typeof budgetInvitation.$inferSelect;
function toInvitationJson(row: InvitationRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    expired: row.expiresAt.getTime() <= Date.now(),
  };
}

/** People in the budget plus invitations still waiting, with the budget row locked. */
async function headcount(tx: Tx, budgetId: string) {
  await tx.select({ id: budget.id }).from(budget).where(eq(budget.id, budgetId)).for("update");
  const [members] = await tx
    .select({ n: count() })
    .from(budgetMember)
    .where(eq(budgetMember.budgetId, budgetId));
  const [pending] = await tx
    .select({ n: count() })
    .from(budgetInvitation)
    .where(
      and(
        eq(budgetInvitation.budgetId, budgetId),
        eq(budgetInvitation.status, "pending"),
        sql`${budgetInvitation.expiresAt} > now()`,
      ),
    );
  return { members: members?.n ?? 0, pending: pending?.n ?? 0 };
}

const FULL = () =>
  new AppError(
    409,
    "BUDGET_FULL",
    `A budget can be shared with up to ${MAX_BUDGET_PEOPLE - 1} people`,
  );

export const listMembersHandler: RouteHandler<typeof listMembers, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const { db } = c.var.deps;
  const { role } = await loadBudgetAccess(c, budgetId);
  const members = await db
    .select({
      userId: budgetMember.userId,
      name: user.name,
      email: user.email,
      role: budgetMember.role,
      joinedAt: budgetMember.createdAt,
    })
    .from(budgetMember)
    .innerJoin(user, eq(user.id, budgetMember.userId))
    .where(eq(budgetMember.budgetId, budgetId))
    .orderBy(sql`${budgetMember.role} <> 'owner'`, asc(budgetMember.createdAt));
  const invitations =
    role === "owner"
      ? await db
          .select()
          .from(budgetInvitation)
          .where(
            and(eq(budgetInvitation.budgetId, budgetId), eq(budgetInvitation.status, "pending")),
          )
          .orderBy(desc(budgetInvitation.createdAt))
      : [];
  return c.json(
    {
      members: members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
      invitations: invitations.map(toInvitationJson),
      maxPeople: MAX_BUDGET_PEOPLE,
    },
    200,
  );
};

export const createInvitationHandler: RouteHandler<typeof createInvitation, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const input = c.req.valid("json");
  const deps = c.var.deps;
  await loadBudgetAccess(c, budgetId, MANAGE);
  const email = input.email.toLowerCase();
  const { token, tokenHash } = newToken();
  const row = await deps.db.transaction(async (tx) => {
    const people = await headcount(tx, budgetId);
    const [member] = await tx
      .select({ id: budgetMember.id })
      .from(budgetMember)
      .innerJoin(user, eq(user.id, budgetMember.userId))
      .where(and(eq(budgetMember.budgetId, budgetId), sql`lower(${user.email}) = ${email}`));
    if (member) {
      throw new AppError(409, "ALREADY_MEMBER", "That person already shares this budget");
    }
    const [waiting] = await tx
      .select()
      .from(budgetInvitation)
      .where(
        and(
          eq(budgetInvitation.budgetId, budgetId),
          eq(budgetInvitation.status, "pending"),
          eq(budgetInvitation.email, email),
        ),
      );
    if (waiting && waiting.expiresAt.getTime() > Date.now()) {
      throw new AppError(
        409,
        "ALREADY_INVITED",
        "That address already has an invitation. Resend it instead.",
      );
    }
    // An expired invitation to the same address is replaced.
    if (waiting) {
      await tx
        .update(budgetInvitation)
        .set({ status: "canceled", tokenHash: null })
        .where(eq(budgetInvitation.id, waiting.id));
    }
    if (people.members + people.pending >= MAX_BUDGET_PEOPLE) throw FULL();
    const [created] = await tx
      .insert(budgetInvitation)
      .values({
        id: newId(),
        budgetId,
        email,
        name: input.name,
        role: "editor",
        status: "pending",
        tokenHash,
        expiresAt: expiry(),
        inviterId: c.var.user.id,
      })
      .returning();
    if (!created) throw new Error("Invitation insert returned nothing");
    return created;
  });
  await deliverEmail(
    deps,
    emails.budgetInvitation(email, c.var.user.email, deps.env.WEB_ORIGIN, token),
  );
  return c.json(toInvitationJson(row), 201);
};

async function pendingInvitation(tx: Tx, budgetId: string, invitationId: string) {
  const [row] = await tx
    .select()
    .from(budgetInvitation)
    .where(
      and(
        eq(budgetInvitation.id, invitationId),
        eq(budgetInvitation.budgetId, budgetId),
        eq(budgetInvitation.status, "pending"),
      ),
    )
    .for("update");
  if (!row) throw new AppError(404, "NOT_FOUND", "Invitation not found");
  return row;
}

export const resendInvitationHandler: RouteHandler<typeof resendInvitation, Env> = async (c) => {
  const { budgetId, invitationId } = c.req.valid("param");
  const deps = c.var.deps;
  await loadBudgetAccess(c, budgetId, MANAGE);
  const { token, tokenHash } = newToken();
  const row = await deps.db.transaction(async (tx) => {
    const existing = await pendingInvitation(tx, budgetId, invitationId);
    // An expired invitation stopped counting toward the limit, so it has to fit again.
    if (existing.expiresAt.getTime() <= Date.now()) {
      const people = await headcount(tx, budgetId);
      if (people.members + people.pending >= MAX_BUDGET_PEOPLE) throw FULL();
    }
    const [updated] = await tx
      .update(budgetInvitation)
      .set({ tokenHash, expiresAt: expiry(), inviterId: c.var.user.id })
      .where(eq(budgetInvitation.id, invitationId))
      .returning();
    if (!updated) throw new Error("Invitation update returned nothing");
    return updated;
  });
  await deliverEmail(
    deps,
    emails.budgetInvitation(row.email, c.var.user.email, deps.env.WEB_ORIGIN, token),
  );
  return c.json(toInvitationJson(row), 200);
};

export const cancelInvitationHandler: RouteHandler<typeof cancelInvitation, Env> = async (c) => {
  const { budgetId, invitationId } = c.req.valid("param");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, MANAGE);
  await db.transaction(async (tx) => {
    await pendingInvitation(tx, budgetId, invitationId);
    await tx
      .update(budgetInvitation)
      .set({ status: "canceled", tokenHash: null })
      .where(eq(budgetInvitation.id, invitationId));
  });
  return c.body(null, 204);
};

/** The invitation a link's token belongs to: pending and unexpired, or a 404/410. */
async function invitationFor(db: Db, token: string) {
  const [row] = await db
    .select({ invitation: budgetInvitation, budgetName: budget.name })
    .from(budgetInvitation)
    .innerJoin(budget, eq(budget.id, budgetInvitation.budgetId))
    .where(eq(budgetInvitation.tokenHash, hashToken(token)));
  if (!row || row.invitation.status !== "pending") {
    throw new AppError(
      404,
      "INVITATION_NOT_FOUND",
      "This invitation was canceled or has already been used",
    );
  }
  if (row.invitation.expiresAt.getTime() <= Date.now()) {
    throw new AppError(
      410,
      "INVITATION_EXPIRED",
      "This invitation has expired. Ask the person who sent it to resend it.",
    );
  }
  return row;
}

export const viewInvitationHandler: RouteHandler<typeof viewInvitation, AppEnv> = async (c) => {
  const { token } = c.req.valid("json");
  const { db } = c.var.deps;
  const { invitation, budgetName } = await invitationFor(db, token);
  const [inviter] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, invitation.inviterId));
  return c.json(
    {
      email: invitation.email,
      budgetName,
      inviterName: inviter?.name ?? "",
      inviterEmail: inviter?.email ?? "",
      expiresAt: invitation.expiresAt.toISOString(),
    },
    200,
  );
};

export const acceptInvitationHandler: RouteHandler<typeof acceptInvitation, Env> = async (c) => {
  const { token } = c.req.valid("json");
  const { db } = c.var.deps;
  const me = c.var.user;
  const budgetId = await db.transaction(async (tx) => {
    const { invitation } = await invitationFor(tx, token);
    if (invitation.email.toLowerCase() !== me.email.toLowerCase()) {
      throw new AppError(
        403,
        "INVITATION_EMAIL_MISMATCH",
        `This invitation is for ${invitation.email}. Sign in with that address to accept it.`,
      );
    }
    const [member] = await tx
      .select({ id: budgetMember.id })
      .from(budgetMember)
      .where(and(eq(budgetMember.budgetId, invitation.budgetId), eq(budgetMember.userId, me.id)));
    if (!member) {
      // The invitation itself was counted while pending, so joining never needs more room than
      // it had; a full budget only happens if members were added some other way.
      const people = await headcount(tx, invitation.budgetId);
      if (people.members + people.pending > MAX_BUDGET_PEOPLE) throw FULL();
      await tx.insert(budgetMember).values({
        id: newId(),
        budgetId: invitation.budgetId,
        userId: me.id,
        role: "editor",
      });
    }
    await tx
      .update(budgetInvitation)
      .set({ status: "accepted", tokenHash: null })
      .where(eq(budgetInvitation.id, invitation.id));
    return invitation.budgetId;
  });
  return c.json({ budgetId }, 200);
};
