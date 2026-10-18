import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import {
  authSecurity,
  requireAuth,
  requireSession,
  sessionSecurity,
} from "../../middleware/require-auth";

export const AiSettingsSchema = z
  .object({
    available: z.boolean().describe("The server has AI set up, so the budget can turn it on"),
    unavailableReason: z
      .enum(["NOT_CONFIGURED"])
      .nullable()
      .describe(
        "Why AI can't be turned on (NOT_CONFIGURED: the server has no AI key); null if it can",
      ),
    enabled: z
      .boolean()
      .describe("In-app AI features are on for this budget (false while unavailable)"),
    assistantButton: z
      .boolean()
      .describe("The floating AI chat button shows on this budget (only while `enabled`)"),
  })
  .openapi("AiSettings");

const UpdateAiSettingsSchema = z
  .strictObject({
    enabled: z.boolean().optional().describe("Turning it off also hides the chat button"),
    assistantButton: z.boolean().optional(),
  })
  .openapi("UpdateAiSettings");

const ConversationSummarySchema = z
  .object({
    id: z.string(),
    title: z.string().describe("The start of the first message"),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime().describe("When the last message was added"),
  })
  .openapi("AiConversationSummary");

const BudgetParams = z.object({
  budgetId: z.string().openapi({ param: { name: "budgetId", in: "path" } }),
});

const notFound = jsonError("No such budget, or the caller isn't a member");

export const getAiSettings = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/ai",
  operationId: "getAiSettings",
  tags: ["AI"],
  security: authSecurity,
  middleware: [requireAuth] as const,
  summary: "The budget's AI settings, and whether the server can run AI",
  request: { params: BudgetParams },
  responses: {
    200: { description: "Settings", content: { "application/json": { schema: AiSettingsSchema } } },
    401: jsonError("Not signed in"),
    403: jsonError("The account's email address isn't confirmed"),
    404: notFound,
  },
});

export const updateAiSettings = createRoute({
  method: "patch",
  path: "/budgets/{budgetId}/ai",
  operationId: "updateAiSettings",
  tags: ["AI"],
  security: sessionSecurity,
  middleware: [requireSession] as const,
  summary: "Turn the budget's AI features or its chat button on or off",
  request: {
    params: BudgetParams,
    body: { required: true, content: { "application/json": { schema: UpdateAiSettingsSchema } } },
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: AiSettingsSchema } } },
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError(
      "The caller's role can't change the budget's settings, NOT_FOR_AGENTS: an agent can't, or the account's email address isn't confirmed",
    ),
    404: notFound,
    409: jsonError(
      "AI_UNAVAILABLE: the server has no AI set up; AI_DISABLED: the chat button needs AI turned on",
    ),
  },
});

const ConversationParams = BudgetParams.extend({
  conversationId: z.string().openapi({ param: { name: "conversationId", in: "path" } }),
});

/** Errors every conversation route shares. */
const aiErrors = {
  401: jsonError("Not signed in"),
  403: jsonError(
    "AI_DISABLED: AI is turned off for this budget; READ_ONLY: a viewer can't use it; NOT_FOR_AGENTS: an agent can't; or the account's email address isn't confirmed",
  ),
  503: jsonError("AI_UNAVAILABLE: the server has no AI set up"),
};

export const listAiConversations = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/ai/conversations",
  operationId: "listAiConversations",
  tags: ["AI"],
  security: sessionSecurity,
  middleware: [requireSession] as const,
  summary: "The caller's conversations with the budget's AI assistant, newest first",
  description: "Conversations are private: each member sees only their own.",
  request: { params: BudgetParams },
  responses: {
    200: {
      description: "Conversations",
      content: {
        "application/json": {
          schema: z
            .object({ conversations: z.array(ConversationSummarySchema) })
            .openapi("AiConversationList"),
        },
      },
    },
    ...aiErrors,
    404: notFound,
  },
});

export const deleteAiConversation = createRoute({
  method: "delete",
  path: "/budgets/{budgetId}/ai/conversations/{conversationId}",
  operationId: "deleteAiConversation",
  tags: ["AI"],
  security: sessionSecurity,
  middleware: [requireSession] as const,
  summary: "Delete one of the caller's conversations",
  request: { params: ConversationParams },
  responses: {
    204: { description: "Deleted" },
    ...aiErrors,
    404: jsonError("No such budget or conversation, or it isn't the caller's"),
  },
});

export const aiChat = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/ai/chat",
  operationId: "aiChat",
  tags: ["AI"],
  security: sessionSecurity,
  middleware: [requireSession] as const,
  summary: "Run the budget's AI assistant on a conversation (server-sent events)",
  description:
    "TanStack AI's chat protocol (AG-UI): the body is a run input with the conversation's " +
    "`threadId` (made by the client; a new one starts a conversation), a `runId`, the new " +
    "`messages`, and a `resume` batch answering pending approvals. The response is the run's " +
    "event stream. The assistant reads the budget freely; every change waits for the person's " +
    "approval (a tool-approval interrupt) and runs as their in-app agent.",
  request: {
    params: BudgetParams,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .looseObject({
              threadId: z
                .string()
                .regex(/^[\w-]{8,100}$/)
                .describe("The conversation's id"),
              runId: z.string().min(1).max(100),
              messages: z.array(z.unknown()),
            })
            .openapi("AiChatRun"),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The run's events",
      content: { "text/event-stream": { schema: z.string() } },
    },
    400: jsonError("Invalid input"),
    ...aiErrors,
    404: jsonError("No such budget, or the conversation isn't the caller's"),
  },
});

export const hydrateAiChat = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/ai/chat",
  operationId: "hydrateAiChat",
  tags: ["AI"],
  security: sessionSecurity,
  middleware: [requireSession] as const,
  summary: "A conversation as the chat client shows it after a reload",
  description:
    "TanStack AI's `reconstructChat`: `{ messages, activeRun, interrupts }` for `threadId`, " +
    "including approvals still waiting on the person. An unknown thread is an empty " +
    "conversation.",
  request: {
    params: BudgetParams,
    query: z.object({
      threadId: z.string().openapi({ param: { name: "threadId", in: "query" } }),
      limit: z.string().optional(),
      before: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "The conversation",
      content: {
        "application/json": {
          schema: z
            .looseObject({
              messages: z.array(z.unknown()),
              activeRun: z.unknown(),
              interrupts: z.unknown(),
            })
            .openapi("AiChatState"),
        },
      },
    },
    ...aiErrors,
    404: jsonError("No such budget, or the conversation isn't the caller's"),
  },
});
