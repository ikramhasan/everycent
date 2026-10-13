import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";

export const UserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    image: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("User");

const unverified = jsonError("The account's email address isn't confirmed");

export const getMe = createRoute({
  method: "get",
  path: "/me",
  operationId: "getMe",
  tags: ["Users"],
  summary: "The signed-in user",
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: "The current user",
      content: { "application/json": { schema: UserSchema } },
    },
    401: jsonError("Not signed in"),
    403: unverified,
  },
});

export const changeEmail = createRoute({
  method: "post",
  path: "/me/email",
  operationId: "changeEmail",
  tags: ["Users"],
  summary: "Start changing the account's email address",
  description:
    "Checks the current password, then emails the current address a link to approve the change; once approved, the new address gets a link to confirm it, and only then does the email change. The answer is the same whether or not the new address already has an account, so it can't be used to find accounts (an address that's taken just never gets a link).",
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              newEmail: z.email().max(254),
              password: z.string().min(1).max(128).describe("The account's current password"),
            })
            .openapi("ChangeEmail"),
        },
      },
    },
  },
  responses: {
    202: {
      description: "Approval link sent to the current address",
      content: {
        "application/json": {
          schema: z.object({ status: z.literal("approval_sent") }).openapi("ChangeEmailResult"),
        },
      },
    },
    400: jsonError(
      "Invalid input (VALIDATION_ERROR), or the new address is the current one (SAME_EMAIL)",
    ),
    401: jsonError("Not signed in"),
    403: jsonError(
      "Wrong password (INVALID_PASSWORD), or the account's email address isn't confirmed",
    ),
    429: jsonError("Too many password attempts (RATE_LIMITED)"),
  },
});

const SessionSchema = z
  .object({
    id: z.string(),
    current: z.boolean().describe("The session making this request"),
    browser: z.string().nullable().describe("e.g. Chrome; null when the user agent is unknown"),
    os: z.string().nullable().describe("e.g. macOS"),
    deviceType: z.enum(["desktop", "mobile", "tablet", "other"]),
    ipAddress: z.string().nullable(),
    createdAt: z.iso.datetime().describe("When this device signed in"),
    lastActiveAt: z.iso.datetime().describe("Last time the session was refreshed (about daily)"),
  })
  .openapi("Session");

export const listSessions = createRoute({
  method: "get",
  path: "/me/sessions",
  operationId: "listSessions",
  tags: ["Users"],
  summary: "Devices signed in to the account, current one first",
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: "Active sessions",
      content: {
        "application/json": {
          schema: z.object({ sessions: z.array(SessionSchema) }).openapi("SessionList"),
        },
      },
    },
    401: jsonError("Not signed in"),
    403: unverified,
  },
});

const SessionParams = z.object({
  sessionId: z.string().openapi({ param: { name: "sessionId", in: "path" } }),
});

export const revokeSession = createRoute({
  method: "delete",
  path: "/me/sessions/{sessionId}",
  operationId: "revokeSession",
  tags: ["Users"],
  summary: "Sign out another device",
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: SessionParams },
  responses: {
    204: { description: "Signed out" },
    400: jsonError("That's this device: sign out instead (CURRENT_SESSION)"),
    401: jsonError("Not signed in"),
    403: unverified,
    404: jsonError("No such session for this account"),
  },
});

export const revokeOtherSessions = createRoute({
  method: "delete",
  path: "/me/sessions",
  operationId: "revokeOtherSessions",
  tags: ["Users"],
  summary: "Sign out every device except this one",
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    204: { description: "Signed out" },
    401: jsonError("Not signed in"),
    403: unverified,
  },
});
