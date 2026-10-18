import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import { requireSession, sessionSecurity } from "../../middleware/require-auth";

const NotificationsSchema = z
  .object({
    monthlySummary: z
      .boolean()
      .describe(
        "The monthly summary email after each month ends, for the budgets below that have it on",
      ),
    monthlySummaryAi: z
      .boolean()
      .describe("The summary's AI overview, on budgets that have AI turned on"),
    budgets: z
      .array(
        z.object({
          budgetId: z.string(),
          name: z.string(),
          monthlySummary: z.boolean().describe("This budget's monthly summary"),
          aiEnabled: z
            .boolean()
            .describe(
              "The budget has AI on (and the server has AI), so its summary can carry the overview",
            ),
        }),
      )
      .describe(
        "The budgets the person is on, in name order; a fresh start's old budget is left out",
      ),
  })
  .openapi("Notifications");

export const getNotifications = createRoute({
  method: "get",
  path: "/me/notifications",
  operationId: "getNotifications",
  tags: ["Users"],
  summary: "The account's email notification options",
  security: sessionSecurity,
  middleware: [requireSession] as const,
  responses: {
    200: {
      description: "Notification options",
      content: { "application/json": { schema: NotificationsSchema } },
    },
    401: jsonError("Not signed in"),
    403: jsonError("The account's email address isn't confirmed"),
  },
});

export const updateNotifications = createRoute({
  method: "patch",
  path: "/me/notifications",
  operationId: "updateNotifications",
  tags: ["Users"],
  summary: "Change the account's email notification options",
  security: sessionSecurity,
  middleware: [requireSession] as const,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              monthlySummary: z.boolean().optional(),
              monthlySummaryAi: z.boolean().optional(),
              budgets: z
                .array(z.object({ budgetId: z.string(), monthlySummary: z.boolean() }))
                .optional()
                .describe("Per-budget changes; budgets left out keep theirs"),
            })
            .openapi("UpdateNotifications"),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Saved",
      content: { "application/json": { schema: NotificationsSchema } },
    },
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError("The account's email address isn't confirmed"),
    404: jsonError("A budget the person isn't on (`NOT_FOUND`)"),
  },
});

export const unsubscribeEmail = createRoute({
  method: "post",
  path: "/email/unsubscribe",
  operationId: "unsubscribeEmail",
  tags: ["Users"],
  summary: "Turn monthly summary emails off from an email's link",
  description:
    "Public: the token from a summary email is the authorization. Serves the web app's " +
    "unsubscribe page and mail clients' one-click unsubscribe (RFC 8058, which posts " +
    "`List-Unsubscribe=One-Click` as a form; the body is ignored).",
  request: {
    query: z.object({ token: z.string().min(1).describe("The token from the email's link") }),
  },
  responses: {
    204: { description: "Monthly summaries are off" },
    400: jsonError("Invalid input"),
    404: jsonError("Not a valid unsubscribe link (`INVALID_TOKEN`)"),
  },
});
