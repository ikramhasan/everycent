import { createRoute, z } from "@hono/zod-openapi";
import { API_KEY_MAX_DAYS, API_KEY_NAME_MAX } from "../../lib/api-keys";
import { jsonError } from "../../lib/errors";
import { requireSession, sessionSecurity } from "../../middleware/require-auth";

const ApiKeyAccess = z
  .enum(["read", "write"])
  .describe("`read`: GET requests only. `write`: reads and changes.");

const ApiKeySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    start: z.string().describe("The key's first characters, to tell keys apart"),
    access: ApiKeyAccess,
    budgetIds: z
      .array(z.string())
      .nullable()
      .describe("The budgets the key may use; null for every budget, including future ones"),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable().describe("Null: never expires"),
    lastUsedAt: z.iso.datetime().nullable(),
  })
  .openapi("ApiKey");

const errors = {
  401: jsonError("Not signed in"),
  403: jsonError(
    "The account's email address isn't confirmed, or the request used an API key (SESSION_REQUIRED)",
  ),
};

export const listApiKeys = createRoute({
  method: "get",
  path: "/me/api-keys",
  operationId: "listApiKeys",
  tags: ["API keys"],
  summary: "The account's active API keys, newest first",
  security: sessionSecurity,
  middleware: [requireSession] as const,
  responses: {
    200: {
      description: "Active keys (the keys themselves are never shown again)",
      content: {
        "application/json": {
          schema: z.object({ apiKeys: z.array(ApiKeySchema) }).openapi("ApiKeyList"),
        },
      },
    },
    ...errors,
  },
});

export const createApiKey = createRoute({
  method: "post",
  path: "/me/api-keys",
  operationId: "createApiKey",
  tags: ["API keys"],
  summary: "Create an API key",
  description:
    "The answer holds the key itself. It's shown only this once: store it somewhere safe.",
  security: sessionSecurity,
  middleware: [requireSession] as const,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              name: z.string().trim().min(1).max(API_KEY_NAME_MAX),
              access: ApiKeyAccess,
              budgetIds: z
                .array(z.string())
                .min(1)
                .max(100)
                .nullable()
                .describe("Budgets the key may use (ones you belong to); null for every budget"),
              expiresInDays: z
                .number()
                .int()
                .min(1)
                .max(API_KEY_MAX_DAYS)
                .nullable()
                .describe("Days until the key stops working; null for never"),
            })
            .openapi("CreateApiKey"),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Created",
      content: {
        "application/json": {
          schema: z
            .object({
              apiKey: ApiKeySchema,
              key: z.string().describe("The key. Shown only once."),
            })
            .openapi("CreatedApiKey"),
        },
      },
    },
    400: jsonError("Invalid input, or a budget you don't belong to (UNKNOWN_BUDGET)"),
    ...errors,
  },
});

export const deleteApiKey = createRoute({
  method: "delete",
  path: "/me/api-keys/{keyId}",
  operationId: "deleteApiKey",
  tags: ["API keys"],
  summary: "Revoke an API key",
  security: sessionSecurity,
  middleware: [requireSession] as const,
  request: {
    params: z.object({ keyId: z.string().openapi({ param: { name: "keyId", in: "path" } }) }),
  },
  responses: {
    204: { description: "Revoked: the key stops working at once" },
    ...errors,
    404: jsonError("No such key for this account"),
  },
});
