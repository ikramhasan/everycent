import { zAccountType, zCurrencyCode, zMinorUnits } from "@everycent/engine";
import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";

const Name = z.string().trim().min(1).max(100);
const IsoDate = z.iso.date().describe("Calendar date, YYYY-MM-DD");
const InterestRate = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,3})?$/, "Expected a percentage like 6.125")
  .describe("Annual interest rate in percent (loan accounts)");

const BalancesSchema = z
  .object({ cleared: zMinorUnits, uncleared: zMinorUnits, working: zMinorUnits })
  .openapi("AccountBalances", {
    description:
      "Future-dated transactions don't count until their date. `listAccounts` takes the user's " +
      "today; other responses use the request's `date`, or the server's UTC date.",
  });

export const AccountSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: zAccountType,
    note: z.string(),
    closed: z.boolean(),
    currency: zCurrencyCode,
    interestRate: z.string().nullable(),
    minimumPayment: zMinorUnits.nullable(),
    escrowAmount: zMinorUnits.nullable(),
    paymentCategoryId: z.string().nullable().describe("Credit accounts: their payment category"),
    hasHistory: z
      .boolean()
      .describe("Has transactions besides its starting balance (so it can be closed, not deleted)"),
    balances: BalancesSchema,
  })
  .openapi("Account");

const AccountListSchema = z
  .object({ accounts: z.array(AccountSchema).describe("In sidebar order, closed ones included") })
  .openapi("AccountList");

const BudgetParams = z.object({
  budgetId: z.string().openapi({ param: { name: "budgetId", in: "path" } }),
});
const AccountParams = BudgetParams.extend({
  accountId: z.string().openapi({ param: { name: "accountId", in: "path" } }),
});

function json<T extends z.ZodType>(schema: T) {
  return { required: true, content: { "application/json": { schema } } } as const;
}
function ok<T extends z.ZodType>(description: string, schema: T) {
  return { description, content: { "application/json": { schema } } };
}
const notFound = jsonError("No such budget or account, or the caller isn't a member");

export const listAccounts = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/accounts",
  operationId: "listAccounts",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "The budget's accounts with their balances",
  request: {
    params: BudgetParams,
    query: z.object({
      today: IsoDate.optional().describe(
        "The user's today; later transactions are left out of balances. Defaults to the " +
          "server's UTC date.",
      ),
    }),
  },
  responses: {
    200: ok("Accounts in sidebar order", AccountListSchema),
    401: jsonError("Not signed in"),
    404: notFound,
  },
});

export const createAccount = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/accounts",
  operationId: "createAccount",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Add an account with its starting balance",
  description:
    "Creates a Starting Balance transaction dated `date`. Credit accounts also get a payment " +
    "category. Debt balances are negative.",
  request: {
    params: BudgetParams,
    body: json(
      z
        .object({
          name: Name,
          type: zAccountType,
          currency: zCurrencyCode
            .optional()
            .describe("Defaults to the budget's currency, which is the only one allowed for now"),
          balance: zMinorUnits.describe("Today's balance; negative for money owed"),
          date: IsoDate.describe("Date of the starting balance (the user's today)"),
          interestRate: InterestRate.optional(),
          minimumPayment: zMinorUnits.optional(),
          escrowAmount: zMinorUnits.optional(),
        })
        .openapi("CreateAccount"),
    ),
  },
  responses: {
    201: ok("Created", AccountSchema),
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't manage accounts"),
    404: notFound,
  },
});

export const updateAccount = createRoute({
  method: "patch",
  path: "/budgets/{budgetId}/accounts/{accountId}",
  operationId: "updateAccount",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Rename an account, edit its note, type or loan details",
  request: {
    params: AccountParams,
    body: json(
      z
        .strictObject({
          name: Name.optional(),
          note: z.string().max(10_000).optional(),
          type: zAccountType
            .optional()
            .describe("Only within the same family (cash, credit, loan, tracking)"),
          interestRate: InterestRate.nullable().optional(),
          minimumPayment: zMinorUnits.nullable().optional(),
          escrowAmount: zMinorUnits.nullable().optional(),
        })
        .openapi("UpdateAccount"),
    ),
  },
  responses: {
    200: ok("Updated", AccountSchema),
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't manage accounts"),
    404: notFound,
  },
});

export const moveAccount = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/accounts/{accountId}/move",
  operationId: "moveAccount",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Move an account before another one, or to the end",
  request: {
    params: AccountParams,
    body: json(
      z
        .object({
          beforeAccountId: z
            .string()
            .nullable()
            .describe("Place it right before this account; null moves it to the end"),
        })
        .openapi("MoveAccount"),
    ),
  },
  responses: {
    200: ok("Accounts in their new order", AccountListSchema),
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't manage accounts"),
    404: notFound,
  },
});

export const closeAccount = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/accounts/{accountId}/close",
  operationId: "closeAccount",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Close an account",
  description:
    "A non-zero balance is zeroed with a Manual Balance Adjustment dated `date` (for budget " +
    "accounts it comes out of Ready to Assign). A credit account's payment category is hidden.",
  request: {
    params: AccountParams,
    body: json(z.object({ date: IsoDate }).openapi("CloseAccount")),
  },
  responses: {
    200: ok("Closed", AccountSchema),
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't manage accounts"),
    404: notFound,
  },
});

export const reopenAccount = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/accounts/{accountId}/reopen",
  operationId: "reopenAccount",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Reopen a closed account (and show its payment category again)",
  request: { params: AccountParams },
  responses: {
    200: ok("Reopened", AccountSchema),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't manage accounts"),
    404: notFound,
  },
});

export const deleteAccount = createRoute({
  method: "delete",
  path: "/budgets/{budgetId}/accounts/{accountId}",
  operationId: "deleteAccount",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Delete an account that has no history beyond its starting balance",
  request: { params: AccountParams },
  responses: {
    204: { description: "Deleted" },
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't manage accounts"),
    404: notFound,
    409: jsonError("ACCOUNT_HAS_HISTORY: close the account instead"),
  },
});
