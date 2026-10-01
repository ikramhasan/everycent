import { CLEARED_STATES } from "@everycent/db/schema";
import { zCurrencyCode, zMinorUnits } from "@everycent/engine";
import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";

const IsoDate = z.iso.date().describe("Calendar date, YYYY-MM-DD");
const PayeeName = z.string().trim().min(1).max(200);
const Memo = z.string().max(500);
/** People toggle between these two; reconciling is its own flow. */
const SettableCleared = z.enum(["uncleared", "cleared"]);

export const TransactionSchema = z
  .object({
    id: z.string(),
    accountId: z.string(),
    accountName: z.string(),
    date: IsoDate,
    amount: zMinorUnits.describe("Negative is an outflow"),
    currency: zCurrencyCode,
    payeeId: z.string().nullable(),
    payeeName: z.string().nullable(),
    categoryId: z.string().nullable(),
    categoryName: z.string().nullable(),
    memo: z.string(),
    cleared: z.enum(CLEARED_STATES),
    runningBalance: zMinorUnits.describe(
      "The account's balance after this transaction, in date order (all of its transactions)",
    ),
  })
  .openapi("Transaction");

const TransactionListSchema = z
  .object({ transactions: z.array(TransactionSchema).describe("Newest first") })
  .openapi("TransactionList");

const BudgetParams = z.object({
  budgetId: z.string().openapi({ param: { name: "budgetId", in: "path" } }),
});
const TransactionParams = BudgetParams.extend({
  transactionId: z.string().openapi({ param: { name: "transactionId", in: "path" } }),
});

function json<T extends z.ZodType>(schema: T) {
  return { required: true, content: { "application/json": { schema } } } as const;
}
function ok<T extends z.ZodType>(description: string, schema: T) {
  return { description, content: { "application/json": { schema } } };
}
const notFound = jsonError("No such budget, account or transaction, or the caller isn't a member");
const forbidden = jsonError("The caller's role can't change transactions");

const categoryRules =
  "On-budget accounts: a null category means Uncategorized; credit-card payment categories " +
  "can't be used. Tracking accounts never have a category. The payee is matched by name " +
  "(ignoring case) and created if new; null leaves it empty.";

export const listTransactions = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/transactions",
  operationId: "listTransactions",
  tags: ["Transactions"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "One account's register, or every account's",
  request: {
    params: BudgetParams,
    query: z.object({
      accountId: z.string().optional().describe("Leave out for all accounts"),
    }),
  },
  responses: {
    200: ok("Transactions", TransactionListSchema),
    401: jsonError("Not signed in"),
    404: notFound,
  },
});

export const createTransaction = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/transactions",
  operationId: "createTransaction",
  tags: ["Transactions"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Add a transaction",
  description: categoryRules,
  request: {
    params: BudgetParams,
    body: json(
      z
        .object({
          accountId: z.string(),
          date: IsoDate,
          amount: zMinorUnits.describe("Negative is an outflow"),
          payeeName: PayeeName.nullable(),
          categoryId: z.string().nullable(),
          memo: Memo.default(""),
          cleared: SettableCleared.default("uncleared"),
        })
        .openapi("CreateTransaction"),
    ),
  },
  responses: {
    201: ok("Created", TransactionSchema),
    400: jsonError("Invalid input, a closed account, or a category the account can't use"),
    401: jsonError("Not signed in"),
    403: forbidden,
    404: notFound,
  },
});

export const updateTransaction = createRoute({
  method: "patch",
  path: "/budgets/{budgetId}/transactions/{transactionId}",
  operationId: "updateTransaction",
  tags: ["Transactions"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Edit a transaction, move it to another account, or toggle cleared",
  description:
    `${categoryRules} Setting \`cleared\` on a reconciled transaction unlocks it. Moving it to ` +
    "an account that can't use its category resets the category.",
  request: {
    params: TransactionParams,
    body: json(
      z
        .strictObject({
          accountId: z.string().optional(),
          date: IsoDate.optional(),
          amount: zMinorUnits.optional(),
          payeeName: PayeeName.nullable().optional(),
          categoryId: z.string().nullable().optional(),
          memo: Memo.optional(),
          cleared: SettableCleared.optional(),
        })
        .openapi("UpdateTransaction"),
    ),
  },
  responses: {
    200: ok("Updated", TransactionSchema),
    400: jsonError("Invalid input, a closed account, or a category the account can't use"),
    401: jsonError("Not signed in"),
    403: forbidden,
    404: notFound,
  },
});

export const deleteTransaction = createRoute({
  method: "delete",
  path: "/budgets/{budgetId}/transactions/{transactionId}",
  operationId: "deleteTransaction",
  tags: ["Transactions"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Delete a transaction",
  request: { params: TransactionParams },
  responses: {
    204: { description: "Deleted" },
    401: jsonError("Not signed in"),
    403: forbidden,
    404: notFound,
  },
});

const PayeeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    lastCategoryId: z
      .string()
      .nullable()
      .describe("Category of the payee's latest categorized transaction, suggested for the next"),
  })
  .openapi("Payee");

export const listPayees = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/payees",
  operationId: "listPayees",
  tags: ["Transactions"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "The budget's payees, by name (built-in ones left out)",
  request: { params: BudgetParams },
  responses: {
    200: ok("Payees", z.object({ payees: z.array(PayeeSchema) }).openapi("PayeeList")),
    401: jsonError("Not signed in"),
    404: notFound,
  },
});
