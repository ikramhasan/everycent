import { CLEARED_STATES, FLAG_COLORS } from "@everycent/db/schema";
import { zCurrencyCode, zMinorUnits } from "@everycent/engine";
import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";

const IsoDate = z.iso.date().describe("Calendar date, YYYY-MM-DD");
const PayeeName = z.string().trim().min(1).max(200);
const Memo = z.string().max(500);
/** People toggle between these two; reconciling is its own flow. */
const SettableCleared = z.enum(["uncleared", "cleared"]);
const Flag = z
  .enum(FLAG_COLORS)
  .nullable()
  .describe("One of YNAB's six flag colors; null clears it");

const SubTransactionSchema = z
  .object({
    id: z.string(),
    amount: zMinorUnits.describe("Negative is an outflow"),
    payeeId: z.string().nullable(),
    payeeName: z.string().nullable(),
    categoryId: z.string().nullable(),
    categoryName: z.string().nullable(),
    memo: z.string(),
    transferAccountId: z.string().nullable().describe("Transfer lines: the other account"),
    transferTransactionId: z
      .string()
      .nullable()
      .describe("Transfer lines: the transaction they keep in the other account"),
  })
  .openapi("SubTransaction");

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
    flag: Flag,
    transferAccountId: z
      .string()
      .nullable()
      .describe('Transfers: the other account (the payee is "Transfer : <account>")'),
    transferTransactionId: z
      .string()
      .nullable()
      .describe(
        "Transfers: the matching transaction in the other account (the split, for a split's " +
          "transfer line)",
      ),
    transferFromSplit: z
      .boolean()
      .describe(
        "The other side is a line of a split, which owns this transfer's date, amount and " +
          "account; only memo, cleared and category change here",
      ),
    subtransactions: z
      .array(SubTransactionSchema)
      .describe("A split's lines, in order (empty when not split); the split has no category"),
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
const reconciled = jsonError(
  "The other side of the transfer is reconciled, so its date and amount can't change; or this " +
    "is a split's transfer side, edited from the split (`TRANSFER_IN_SPLIT`)",
);

const categoryRules =
  "On-budget accounts: a null category means Uncategorized; credit-card payment categories " +
  "can't be used. Tracking accounts never have a category. The payee is matched by name " +
  "(ignoring case) and created if new; null leaves it empty.";

const transferRules =
  "`transferAccountId` (instead of `payeeName`) makes it a transfer: a matching transaction " +
  "with the opposite amount is kept in that account. Only a transfer from a budget account to " +
  "a tracking account has a category (on the budget side), as money leaves the budget. New " +
  "transfers need both accounts open.";

const splitRules =
  "`subtransactions` (two or more lines, adding up to the amount) splits it across categories; " +
  "its own `categoryId` is then null. Lines follow the same category and transfer rules. Only " +
  "budget accounts have splits, and a transfer can't be split (its lines can be transfers).";

const SubTransactionInput = z
  .object({
    id: z.string().optional().describe("An existing line of this split; leave out for new ones"),
    amount: zMinorUnits.describe("Negative is an outflow"),
    payeeName: PayeeName.nullable().default(null),
    transferAccountId: z.string().optional().describe("Make this line a transfer"),
    categoryId: z.string().nullable().default(null),
    memo: Memo.default(""),
  })
  .openapi("SubTransactionInput");
const SubTransactions = z.array(SubTransactionInput).min(2);

const TransferAccountId = z
  .string()
  .describe("Make this a transfer to or from that account; leave `payeeName` out");

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
  summary: "Add a transaction, a transfer or a split",
  description: `${categoryRules} ${transferRules} ${splitRules}`,
  request: {
    params: BudgetParams,
    body: json(
      z
        .object({
          accountId: z.string(),
          date: IsoDate,
          amount: zMinorUnits.describe("Negative is an outflow"),
          payeeName: PayeeName.nullable().default(null),
          transferAccountId: TransferAccountId.optional(),
          categoryId: z.string().nullable(),
          memo: Memo.default(""),
          subtransactions: SubTransactions.optional(),
          cleared: SettableCleared.default("uncleared"),
          flag: Flag.default(null),
        })
        .openapi("CreateTransaction"),
    ),
  },
  responses: {
    201: ok("Created", TransactionSchema.describe("The side in `accountId`")),
    400: jsonError(
      "Invalid input, a closed account, a category the account can't use, or a transfer to the " +
        "same account",
    ),
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
    `${categoryRules} ${transferRules} On a transfer, date and amount changes apply to both ` +
    "sides; memo, cleared, flag and category are per side. Setting `payeeName` turns a transfer back " +
    "into a normal transaction and deletes the other side. Setting `cleared` on a reconciled " +
    "transaction unlocks it. Moving it to an account that can't use its category resets the " +
    "category. " +
    `${splitRules} Sending \`subtransactions\` replaces a split's lines (matched by \`id\`); ` +
    "changing a split's amount needs new lines too. Giving a split a `categoryId` (or making " +
    "it a transfer) un-splits it. A split's transfer side only takes memo, cleared, flag and category.",
  request: {
    params: TransactionParams,
    body: json(
      z
        .strictObject({
          accountId: z.string().optional(),
          date: IsoDate.optional(),
          amount: zMinorUnits.optional(),
          payeeName: PayeeName.nullable().optional(),
          transferAccountId: TransferAccountId.optional(),
          categoryId: z.string().nullable().optional(),
          memo: Memo.optional(),
          cleared: SettableCleared.optional(),
          flag: Flag.optional(),
          subtransactions: SubTransactions.optional(),
        })
        .openapi("UpdateTransaction"),
    ),
  },
  responses: {
    200: ok("Updated", TransactionSchema),
    400: jsonError(
      "Invalid input, a closed account, a category the account can't use, or a transfer to the " +
        "same account",
    ),
    401: jsonError("Not signed in"),
    403: forbidden,
    404: notFound,
    409: reconciled,
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
  description:
    "Deleting either side of a transfer deletes both. Deleting a split deletes its transfer " +
    "lines' other sides; those can't be deleted on their own.",
  request: { params: TransactionParams },
  responses: {
    204: { description: "Deleted" },
    401: jsonError("Not signed in"),
    403: forbidden,
    404: notFound,
    409: reconciled,
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
  summary: "The budget's payees, by name (built-in and transfer ones left out)",
  request: { params: BudgetParams },
  responses: {
    200: ok("Payees", z.object({ payees: z.array(PayeeSchema) }).openapi("PayeeList")),
    401: jsonError("Not signed in"),
    404: notFound,
  },
});
