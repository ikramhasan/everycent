import { bigint, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { budget } from "./budget";
import { timestamps } from "./columns";

/**
 * A conversation with a budget's AI assistant, private to the person who had it. Not budget
 * data: no audit triggers (it isn't in the change log or live updates), and backups and fresh
 * starts leave it out. Its id is TanStack AI's `threadId`; the transcript, runs and pending
 * approvals are in the `ai_chat_*` tables below.
 */
export const aiConversation = pgTable(
  "ai_conversation",
  {
    id: text().primaryKey(),
    budgetId: text()
      .notNull()
      .references(() => budget.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The start of the first message. */
    title: text().notNull(),
    ...timestamps,
  },
  (t) => [index("ai_conversation_list_idx").on(t.budgetId, t.userId, t.updatedAt)],
);

// TanStack AI's chat persistence stores (`@tanstack/ai-persistence`), written only by its
// `withPersistence` middleware through `apps/api/src/lib/ai/persistence.ts`. Column shapes follow
// its store reference: JSON payloads as jsonb, epoch-ms timestamps as bigint.

/** A conversation's full model-message transcript (`MessageStore`). */
export const aiChatThread = pgTable("ai_chat_thread", {
  threadId: text()
    .primaryKey()
    .references(() => aiConversation.id, { onDelete: "cascade" }),
  messages: jsonb().$type<unknown[]>().notNull(),
  updatedAt: bigint({ mode: "number" }).notNull(),
});

/** One model run of a conversation (`RunStore`). */
export const aiChatRun = pgTable(
  "ai_chat_run",
  {
    runId: text().primaryKey(),
    threadId: text()
      .notNull()
      .references(() => aiConversation.id, { onDelete: "cascade" }),
    status: text().notNull(),
    startedAt: bigint({ mode: "number" }).notNull(),
    finishedAt: bigint({ mode: "number" }),
    error: text(),
    errorCode: text(),
    usage: jsonb(),
    parentRunId: text(),
    subagentRunId: text(),
    name: text(),
  },
  (t) => [
    index("ai_chat_run_thread_idx").on(t.threadId, t.startedAt),
    index("ai_chat_run_parent_idx").on(t.parentRunId, t.startedAt),
  ],
);

/** A pause waiting on the person, e.g. approving a change the assistant wants to make. */
export const aiChatInterrupt = pgTable(
  "ai_chat_interrupt",
  {
    interruptId: text().primaryKey(),
    runId: text().notNull(),
    threadId: text()
      .notNull()
      .references(() => aiConversation.id, { onDelete: "cascade" }),
    status: text({ enum: ["pending", "resolved", "cancelled"] }).notNull(),
    requestedAt: bigint({ mode: "number" }).notNull(),
    resolvedAt: bigint({ mode: "number" }),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    response: jsonb(),
  },
  (t) => [
    index("ai_chat_interrupt_thread_idx").on(t.threadId, t.requestedAt),
    index("ai_chat_interrupt_run_idx").on(t.runId, t.requestedAt),
  ],
);

/**
 * A change the assistant made, by the tool call that made it. A run that fails after its tools ran
 * leaves their approvals pending (TanStack AI commits answers only when a run succeeds), so a retry
 * would run them again; the second time, the stored result is returned instead.
 */
export const aiToolRun = pgTable("ai_tool_run", {
  toolCallId: text().primaryKey(),
  threadId: text()
    .notNull()
    .references(() => aiConversation.id, { onDelete: "cascade" }),
  output: jsonb(),
  createdAt: timestamps.createdAt,
});
