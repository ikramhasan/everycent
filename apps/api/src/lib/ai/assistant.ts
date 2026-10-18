import type { Database } from "@everycent/db";
import { aiToolRun } from "@everycent/db/schema";
import type { AnyTextAdapter, JSONSchema } from "@tanstack/ai";
import { toolDefinition } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { eq } from "drizzle-orm";
import type { Env } from "../../env";
import type { AgentOperation } from "../agents/operations";
import { type AgentPrincipal, connectAgent } from "../agents/principal";
import type { AgentRuntime, OperationResult } from "../agents/runtime";
import type { AuthUser } from "../auth";
import type { BudgetRow } from "../budget-access";
import { calculate } from "./calculate";
import { chartInputSchema, checkChart } from "./chart";

/** The model behind the in-app assistant, from the server's AI key and `AI_MODEL`. */
export function anthropicAdapter(env: Env): AnyTextAdapter | null {
  if (!env.AI_API_KEY) return null;
  return createAnthropicChat(env.AI_MODEL, env.AI_API_KEY);
}

/**
 * The in-app assistant acting for the signed-in person: the same agent principal MCP clients get,
 * so its tool calls run through the API's own routes, permissions and change attribution. It
 * needs no sign-in of its own; the person's session is the authorization.
 */
export async function inAppPrincipal(db: Database, user: AuthUser): Promise<AgentPrincipal> {
  const agent = await connectAgent(db, {
    userId: user.id,
    kind: "in_app",
    externalId: "everycent",
    name: "everycent AI",
    authorizedAt: new Date(),
  });
  if (!agent) throw new Error("Couldn't record the in-app assistant");
  return { user, agent, canWrite: true };
}

/**
 * Operations the assistant doesn't get, beyond what agents never get (`operations.ts`): files
 * (downloads and uploads), its own AI settings and conversations, and what only the person may do
 * to a budget (delete it, start fresh, sharing), which an agent is refused anyway.
 */
const NOT_FOR_ASSISTANT = new Set([
  "getAccountLogo",
  "getAttachment",
  "exportBackup",
  "exportPlan",
  "exportRegister",
  "exportSelectedTransactions",
  "deleteBudget",
  "freshStartBudget",
  "createBudgetInvitation",
  "resendBudgetInvitation",
  "cancelBudgetInvitation",
  "removeBudgetMember",
  "changeBudgetMemberRole",
  "leaveBudget",
  "transferBudgetOwnership",
  "getAiSettings",
  "updateAiSettings",
  "listAiConversations",
  "deleteAiConversation",
  "aiChat",
  "hydrateAiChat",
]);

/**
 * Sent to the model on every turn. The rest are lazy: the model sees their names and loads a
 * schema when it needs one, which keeps ~90 tool schemas out of every request.
 */
const EAGER = new Set([
  "getBudget",
  "listAccounts",
  "listCategories",
  "getBudgetMonth",
  "listTransactions",
  "listPayees",
  "listScheduledTransactions",
  "getReportActivity",
  "listReportTransactions",
  "createTransaction",
  "updateTransaction",
  "deleteTransaction",
  "assignCategory",
  "moveMoney",
]);

/**
 * Copies a schema with its local `#/$defs/…` references replaced by the definitions themselves.
 * TanStack AI's Anthropic adapter sends a tool's `properties` and `required` only, dropping
 * `$defs`, so a `$ref` would reach Claude unresolved (it then guessed `body` was a string).
 * Hand-rolled: our refs are only ever local `$defs` ones, which a ref-parser library is far
 * bigger than. A definition that refers to itself stops at the second level.
 */
function inlineRefs(node: unknown, defs: Record<string, unknown>, seen: string[] = []): unknown {
  if (Array.isArray(node)) return node.map((item) => inlineRefs(item, defs, seen));
  if (!node || typeof node !== "object") return node;
  const { $ref, $defs: _, ...rest } = node as Record<string, unknown>;
  const name = typeof $ref === "string" ? $ref.match(/^#\/\$defs\/(.+)$/)?.[1] : undefined;
  const out: Record<string, unknown> = {};
  if (name !== undefined) {
    if (seen.filter((n) => n === name).length < 2 && defs[name] !== undefined) {
      Object.assign(out, inlineRefs(defs[name], defs, [...seen, name]));
    }
  } else if ($ref !== undefined) {
    out.$ref = $ref;
  }
  for (const [key, value] of Object.entries(rest)) out[key] = inlineRefs(value, defs, seen);
  return out;
}

/**
 * What a change tool asks the model to write for the person approving it. The app shows this
 * sentence on the approval card; the server drops it before running the operation.
 */
const SUMMARY = {
  type: "string",
  description:
    'For the person approving this change: one short sentence in plain words saying exactly what will change, using names, amounts and dates as they would say them, never ids. For example: "Add a $12.50 Chipotle lunch to Checking under Dining out, dated Oct 18."',
} as const;

/**
 * An operation's argument schema for the model: references inlined, without `budgetId` (the
 * server fills it in), and for a change, with the `summary` the person approves.
 */
export function toolSchema(schema: AgentOperation["inputSchema"], change: boolean): JSONSchema {
  const defs = (schema.$defs ?? {}) as Record<string, unknown>;
  const inlined = inlineRefs(schema, defs) as Record<string, unknown>;
  const { budgetId: _, ...properties } = (inlined.properties ?? {}) as Record<string, unknown>;
  const required = Array.isArray(inlined.required)
    ? (inlined.required as string[]).filter((name) => name !== "budgetId")
    : [];
  return (
    change
      ? {
          ...inlined,
          properties: { summary: SUMMARY, ...properties },
          required: ["summary", ...required],
        }
      : { ...inlined, properties, required }
  ) as JSONSchema;
}

/** What the model sees of an operation's answer; errors come back as `{ error }` to recover from. */
function toolOutput(result: OperationResult): unknown {
  switch (result.kind) {
    case "json":
      if (result.ok) return result.data;
      return (result.data as { error?: unknown } | null)?.error
        ? result.data
        : { error: { code: `HTTP_${result.status}`, message: "The request failed" } };
    case "text":
      return result.ok ? { text: result.text } : { error: { message: result.text } };
    case "empty":
      return { done: true };
    case "binary":
    case "redirect":
      return { error: { message: "That operation returns a file, which this chat can't show" } };
  }
}

/**
 * The budget's operations as tools, each pinned to this budget: `budgetId` is filled in by the
 * server, so the assistant can't reach another budget. Anything that changes data needs the
 * person's approval before it runs; reads run straight away.
 */
export function budgetTools(
  runtime: AgentRuntime,
  principal: AgentPrincipal,
  scope: {
    db: Database;
    budgetId: string;
    threadId: string;
    /**
     * Tools to load up front this time: the ones whose approvals a resume answers. A lazy tool is
     * known only once its discovery is in the run's messages, and a resume brings none.
     */
    alsoEager?: ReadonlySet<string>;
  },
) {
  const { db, budgetId, threadId, alsoEager } = scope;
  /** Runs a change once per tool call, however often its approval is retried. */
  async function once(toolCallId: string | undefined, change: () => Promise<OperationResult>) {
    if (!toolCallId) return toolOutput(await change());
    const [done] = await db
      .select({ output: aiToolRun.output })
      .from(aiToolRun)
      .where(eq(aiToolRun.toolCallId, toolCallId));
    if (done) return done.output;
    const result = await change();
    const output = toolOutput(result);
    // A refused change changed nothing, so trying it again is safe; only record what happened.
    if (result.ok) {
      await db
        .insert(aiToolRun)
        .values({ toolCallId, threadId, output })
        .onConflictDoNothing({ target: aiToolRun.toolCallId });
    }
    return output;
  }

  const operations = [...runtime.operations().values()]
    .filter(
      (op) =>
        op.pathParams.includes("budgetId") &&
        !NOT_FOR_ASSISTANT.has(op.name) &&
        op.body?.kind !== "multipart",
    )
    .map((op) =>
      toolDefinition({
        name: op.name,
        description: op.description,
        inputSchema: toolSchema(op.inputSchema, !op.readOnly),
        needsApproval: !op.readOnly,
        lazy: !EAGER.has(op.name) && !alsoEager?.has(op.name),
      }).server(async (args, ctx) => {
        const { summary: _, ...input } =
          args && typeof args === "object" ? (args as Record<string, unknown>) : {};
        const run = () => runtime.run(principal, op.name, { ...input, budgetId });
        return op.readOnly ? toolOutput(await run()) : once(ctx?.toolCallId, run);
      }),
    );
  return [calculator, chartPresenter, ...operations];
}

/** Shows the person a chart in the conversation (`chart.ts`); the app draws it. */
const chartPresenter = toolDefinition({
  name: "presentChart",
  description:
    "Show the person a chart in the chat: bar, line, area, pie, radar or radial. Use it whenever a trend, breakdown or comparison is easier to see than to read, such as spending by category, income vs. expenses by month, or net worth over time. Get the numbers from the other tools first; money values are integer minor units exactly as those tools return them. After the chart, add a sentence or two about what stands out; don't repeat every number.",
  inputSchema: chartInputSchema,
}).server(async (args) => checkChart(args));

/** Exact arithmetic for the model, which shouldn't do sums in its head (`calculate.ts`). */
const calculator = toolDefinition({
  name: "calculate",
  description:
    'Evaluate an arithmetic expression exactly, in decimals (64 significant digits): use it for every sum, difference, product, ratio, percentage or rounding instead of working it out yourself. Supports + - * / ^, parentheses, sum(), min(), max(), abs(), round(x, decimals), floor(), ceil(), sqrt(), and comparisons like 12 > 8. Example: calculate("5286 - 12.50 - 8") returns 5265.5.',
  inputSchema: {
    type: "object",
    properties: {
      expression: { type: "string", description: 'One expression, e.g. "(1400 + 292.47) * 0.1"' },
    },
    required: ["expression"],
  },
}).server(async (args) =>
  calculate(String((args as { expression?: unknown } | null)?.expression ?? "")),
);

/** The assistant's standing instructions for one budget. */
export function systemPrompt(b: Pick<BudgetRow, "name" | "currency">, today: string): string {
  return [
    `You are the AI assistant in everycent, a zero-based (YNAB-style) budgeting app. You are helping the signed-in person with their budget "${b.name}" (base currency ${b.currency}). Today is ${today}.`,
    'Use the tools to look things up rather than guessing; every tool works on this budget only. Money amounts are integer strings in the currency\'s minor units ("-1250" is -12.50 in a two-decimal currency): convert them when you talk about money, and send them that way. Months are YYYY-MM, dates YYYY-MM-DD.',
    "Tools that change the budget only run once the person approves them in the app, so call them directly when the person asks for a change; don't ask for confirmation in text first. Each one takes a `summary`: the plain-language sentence the person reads when approving, so make it exact and free of ids. If they deny one, don't retry it; ask what they'd like instead. Say a change is done only after its tool succeeds.",
    "Never do arithmetic in your head: use the calculate tool for every total, difference, percentage, average or split, including converting between minor units and amounts.",
    "When a trend, breakdown or comparison would be clearer as a picture, show it with presentChart.",
    "Be brief and concrete. Use the budget's own names for accounts, categories and payees.",
  ].join("\n\n");
}
