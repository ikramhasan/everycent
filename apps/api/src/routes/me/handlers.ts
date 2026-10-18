import { sql } from "@everycent/db";
import {
  auditEvent,
  budget,
  budgetMember,
  session,
  transaction,
  twoFactor,
  userPreference,
  user as userTable,
  verification,
} from "@everycent/db/schema";
import type { RouteConfig, RouteHandler } from "@hono/zod-openapi";
import { APIError } from "better-auth/api";
import Bowser from "bowser";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { pauseAudit } from "../../lib/audit-context";
import { deleteBudgetTransactions } from "../../lib/delete-budget";
import { AppError } from "../../lib/errors";
import { consumePasswordCheck } from "../../lib/throttle";
import { type AuthedEnv, sessionOf } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type {
  changeEmail,
  deleteAccount,
  disableTwoFactor,
  getMe,
  getPreferences,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  updatePreferences,
} from "./routes";

type Handler<R extends RouteConfig> = RouteHandler<R, AppEnv & AuthedEnv>;

export const getMeHandler: Handler<typeof getMe> = (c) => {
  const user = c.var.user;
  return c.json(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      image: user.image ?? null,
      createdAt: user.createdAt.toISOString(),
    },
    200,
  );
};

export const changeEmailHandler: Handler<typeof changeEmail> = async (c) => {
  const { db, auth } = c.var.deps;
  const { newEmail, password } = c.req.valid("json");
  const headers = c.req.raw.headers;

  await consumePasswordCheck(db, c.var.user.id);
  try {
    await auth.api.verifyPassword({ body: { password }, headers });
  } catch (e) {
    if (e instanceof APIError && e.statusCode < 500) {
      throw new AppError(403, "INVALID_PASSWORD", "That password isn't right");
    }
    throw e;
  }
  if (newEmail.toLowerCase() === c.var.user.email.toLowerCase()) {
    throw new AppError(400, "SAME_EMAIL", "That's already the account's email address");
  }
  await auth.api.changeEmail({ body: { newEmail }, headers });
  return c.json({ status: "approval_sent" as const }, 202);
};

type DeviceType = "desktop" | "mobile" | "tablet" | "other";

function describeDevice(userAgent: string | null): {
  browser: string | null;
  os: string | null;
  deviceType: DeviceType;
} {
  if (!userAgent) return { browser: null, os: null, deviceType: "other" };
  const { browser, os, platform } = Bowser.parse(userAgent);
  const type = platform.type;
  return {
    browser: browser.name ?? null,
    os: os.name ?? null,
    deviceType: type === "desktop" || type === "mobile" || type === "tablet" ? type : "other",
  };
}

export const listSessionsHandler: Handler<typeof listSessions> = async (c) => {
  const currentId = sessionOf(c).id;
  const rows = await c.var.deps.db
    .select()
    .from(session)
    .where(and(eq(session.userId, c.var.user.id), gt(session.expiresAt, new Date())))
    .orderBy(desc(session.updatedAt));
  rows.sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId));
  return c.json(
    {
      sessions: rows.map((row) => ({
        id: row.id,
        current: row.id === currentId,
        ...describeDevice(row.userAgent),
        ipAddress: row.ipAddress,
        createdAt: row.createdAt.toISOString(),
        lastActiveAt: row.updatedAt.toISOString(),
      })),
    },
    200,
  );
};

export const revokeSessionHandler: Handler<typeof revokeSession> = async (c) => {
  const { sessionId } = c.req.valid("param");
  if (sessionId === sessionOf(c).id) {
    throw new AppError(400, "CURRENT_SESSION", "That's this device: sign out instead");
  }
  const row = await c.var.deps.db.query.session.findFirst({
    where: and(eq(session.id, sessionId), eq(session.userId, c.var.user.id)),
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "No such session");
  // The token is looked up here and never leaves the server.
  await c.var.deps.auth.api.revokeSession({
    body: { token: row.token },
    headers: c.req.raw.headers,
  });
  return c.body(null, 204);
};

export const revokeOtherSessionsHandler: Handler<typeof revokeOtherSessions> = async (c) => {
  await c.var.deps.auth.api.revokeOtherSessions({ headers: c.req.raw.headers });
  return c.body(null, 204);
};

export const disableTwoFactorHandler: Handler<typeof disableTwoFactor> = async (c) => {
  const { db, auth } = c.var.deps;
  const { code } = c.req.valid("json");
  const me = c.var.user;
  if (!me.twoFactorEnabled) {
    throw new AppError(400, "TWO_FACTOR_NOT_ENABLED", "Two-step verification isn't on");
  }
  await consumePasswordCheck(db, me.id);
  try {
    // With a session, the plugin only checks the code against the stored secret.
    await auth.api.verifyTOTP({ body: { code }, headers: c.req.raw.headers });
  } catch (e) {
    if (e instanceof APIError && e.statusCode < 500) {
      throw new AppError(
        403,
        "INVALID_CODE",
        "That code isn't right. Codes change every 30 seconds.",
      );
    }
    throw e;
  }
  // What the plugin's own disable does, minus its password check (YNAB asks for a code instead).
  await db.transaction(async (tx) => {
    await tx.update(userTable).set({ twoFactorEnabled: false }).where(eq(userTable.id, me.id));
    await tx.delete(twoFactor).where(eq(twoFactor.userId, me.id));
  });
  return c.body(null, 204);
};

async function preferencesOf(db: AppEnv["Variables"]["deps"]["db"], userId: string) {
  const [row] = await db
    .select({
      openLastBudget: userPreference.openLastBudget,
      keyboardShortcuts: userPreference.keyboardShortcuts,
      displayCurrency: userPreference.displayCurrency,
    })
    .from(userPreference)
    .where(eq(userPreference.userId, userId));
  return row ?? { openLastBudget: true, keyboardShortcuts: true, displayCurrency: null };
}

export const getPreferencesHandler: Handler<typeof getPreferences> = async (c) =>
  c.json(await preferencesOf(c.var.deps.db, c.var.user.id), 200);

export const updatePreferencesHandler: Handler<typeof updatePreferences> = async (c) => {
  const { db } = c.var.deps;
  const input = c.req.valid("json");
  await db
    .insert(userPreference)
    .values({ userId: c.var.user.id, ...input })
    .onConflictDoUpdate({
      target: userPreference.userId,
      set: { ...input, updatedAt: sql`now()` },
    });
  return c.json(await preferencesOf(db, c.var.user.id), 200);
};

export const deleteAccountHandler: Handler<typeof deleteAccount> = async (c) => {
  const { db, auth } = c.var.deps;
  const { password } = c.req.valid("json");
  const me = c.var.user;
  await consumePasswordCheck(db, me.id);
  try {
    await auth.api.verifyPassword({ body: { password }, headers: c.req.raw.headers });
  } catch (e) {
    if (e instanceof APIError && e.statusCode < 500) {
      throw new AppError(403, "INVALID_PASSWORD", "That password isn't right");
    }
    throw e;
  }
  await db.transaction(async (tx) => {
    // YNAB: "any budgets that you owned will be unshared and deleted. Any budgets that were
    // shared with you will no longer be shared." Deleting a budget cascades to everything in it.
    const owned = await tx
      .select({ id: budgetMember.budgetId })
      .from(budgetMember)
      .where(and(eq(budgetMember.userId, me.id), eq(budgetMember.role, "owner")));
    // Split lines would block the cascade to the categories (EVERYCENT-207).
    for (const { id } of owned) await deleteBudgetTransactions(tx, id);
    await tx.delete(budget).where(
      inArray(
        budget.id,
        owned.map((o) => o.id),
      ),
    );
    // Reset-password tokens are stored with the user's id as their value.
    await tx.delete(verification).where(eq(verification.value, me.id));
    // Memberships, sessions, logins, options and two-step verification cascade from the user.
    await tx.delete(userTable).where(eq(userTable.id, me.id));
    // Shared budgets keep their history and transactions, without the user's id.
    await pauseAudit(tx);
    await tx.update(auditEvent).set({ actorUserId: null }).where(eq(auditEvent.actorUserId, me.id));
    await tx
      .update(transaction)
      .set({ createdByUserId: null })
      .where(eq(transaction.createdByUserId, me.id));
    await tx
      .update(transaction)
      .set({ updatedByUserId: null })
      .where(eq(transaction.updatedByUserId, me.id));
  });
  return c.body(null, 204);
};
