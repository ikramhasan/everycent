import { session } from "@everycent/db/schema";
import type { RouteConfig, RouteHandler } from "@hono/zod-openapi";
import { APIError } from "better-auth/api";
import Bowser from "bowser";
import { and, desc, eq, gt } from "drizzle-orm";
import { AppError } from "../../lib/errors";
import { consumePasswordCheck } from "../../lib/throttle";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type {
  changeEmail,
  getMe,
  listSessions,
  revokeOtherSessions,
  revokeSession,
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
  const currentId = c.var.session.id;
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
  if (sessionId === c.var.session.id) {
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
