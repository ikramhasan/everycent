import { CLEARED_STATES, FLAG_COLORS } from "@everycent/db/schema";
import { zCurrencyCode, zMinorUnits } from "@everycent/engine";
import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";
import { SORT_COLUMNS } from "./register-query";

const IsoDate = z.iso.date().describe("Calendar date, YYYY-MM-DD");
const SearchText = z
  .string()
  .max(500)
  .describe(
    "YNAB's search: comma-separated terms that must all match, each free text (payee, " +
      "category, memo or account name, or an exact amount) or one of `Payee:`, `Category:` " +
      "(`Category: Split` for splits), `Memo:`, `Account:`, `Flag:` (a color, its name or " +
      "None), `Is:` (Uncleared, Cleared, Reconciled, Unreconciled, Cleared or Reconciled), " +
      "`Outflow:`/`Inflow:` (`25`, `>=25`, `<=25`), `On:`/`Before:`/`After:` (a date in the " +
      "budget's format; before and after include the day). Split lines are matched one by one.",
  );
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
      "The account's balance after this transaction, in date order (all of its transactions; " +
        "within a day, inflows first, then outflows from smallest to largest)",
    ),
    matchingLineIds: z
      .array(z.string())
      .nullable()
      .describe(
        "Under a search: the split lines that match it (the register shows only those). Null " +
          "without a search",
      ),
  })
  .openapi("Transaction");

const TransactionListSchema = z
  .object({
    transactions: z.array(TransactionSchema).describe("One page, in the requested order"),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pass as `cursor` for the next page; null on the last page"),
    someHidden: z
      .boolean()
      .nullable()
      .describe(
        "Whether the search, dates or hidden reconciled transactions leave any of the register " +
          "out (first page only; null on later pages)",
      ),
  })
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
  summary: "One account's register, or every account's, a page at a time",
  description:
    "Filters and search narrow the rows but not the running balance: each row keeps the " +
    "account's real balance at that point, computed over all of its transactions. Pages are " +
    "keyset-paged: pass the previous page's `nextCursor` (with the same filters and sort).",
  request: {
    params: BudgetParams,
    query: z.object({
      accountId: z.string().optional().describe("Leave out for all accounts"),
      q: SearchText.optional(),
      from: IsoDate.optional().describe("On or after this date"),
      to: IsoDate.optional().describe("On or before this date"),
      hideReconciled: z
        .stringbool()
        .optional()
        .describe('The View menu\'s "Show Reconciled Transactions" turned off'),
      sort: z.enum(SORT_COLUMNS).default("date"),
      dir: z.enum(["asc", "desc"]).default("desc"),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: ok("Transactions", TransactionListSchema),
    400: jsonError("Invalid input, or a cursor from another register or sort (INVALID_CURSOR)"),
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

const RegisterFilterSchema = z
  .object({
    accountId: z.string().optional(),
    q: SearchText.optional(),
    from: IsoDate.optional(),
    to: IsoDate.optional(),
    hideReconciled: z.boolean().optional(),
  })
  .describe("The same filter as the register's query parameters")
  .openapi("RegisterFilter");

const SelectionSchema = z
  .union([
    z.strictObject({
      ids: z.array(z.string()).min(1).max(1000).describe("Transactions ticked one by one"),
    }),
    z.strictObject({
      filter: RegisterFilterSchema.describe("Select all: every transaction this filter matches"),
      exclude: z.array(z.string()).max(1000).default([]).describe("Unticked after selecting all"),
    }),
  ])
  .openapi("TransactionSelection");

const BulkActionSchema = z
  .discriminatedUnion("type", [
    z.strictObject({ type: z.literal("cleared"), cleared: SettableCleared }),
    z.strictObject({ type: z.literal("flag"), flag: Flag }),
    z.strictObject({ type: z.literal("categorize"), categoryId: z.string() }),
    z.strictObject({ type: z.literal("memo"), memo: Memo.min(1) }),
    z.strictObject({ type: z.literal("move"), accountId: z.string() }),
    z.strictObject({ type: z.literal("delete") }),
  ])
  .openapi("BulkAction");

export const summarizeSelection = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/transactions/selection",
  operationId: "summarizeSelection",
  tags: ["Transactions"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "How many transactions a selection holds and their total",
  request: { params: BudgetParams, body: json(z.object({ selection: SelectionSchema })) },
  responses: {
    200: ok(
      "Selection",
      z
        .object({
          count: z.number().int(),
          total: zMinorUnits.describe("Sum of the amounts, in the budget's currency"),
          uncleared: z.number().int(),
          cleared: z.number().int(),
          reconciled: z.number().int(),
          categorizable: z
            .number()
            .int()
            .describe(
              "Transactions that take a category (not transfers within the budget, nor tracking accounts)",
            ),
          splits: z.number().int(),
          splitsWithTransfers: z
            .number()
            .int()
            .describe("Splits with a transfer line, which categorize keeps split"),
          deletable: z
            .number()
            .int()
            .describe("All but the other sides of splits' transfer lines (deleted with the split)"),
        })
        .openapi("SelectionSummary"),
    ),
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    404: notFound,
  },
});

export const bulkUpdateTransactions = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/transactions/bulk",
  operationId: "bulkUpdateTransactions",
  tags: ["Transactions"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Apply one action to every selected transaction it applies to",
  description:
    "Follows YNAB's action bar: rows an action doesn't apply to are skipped, and `updated` " +
    "counts the rest. `cleared` skips reconciled rows. `categorize` skips transfers within " +
    "the budget and tracking-account rows; it un-splits splits, except splits with a transfer " +
    "line, which stay split with every other line given the category. `memo` replaces the " +
    "memo (a split's own, not its lines'). `move` moves rows to another account like a " +
    "single edit (a transfer keeps its other side, which then points at the new account) and " +
    "skips rows already there, transfers into their own other account and splits with a " +
    "transfer line to it. `delete` deletes transfers' other sides too and skips the other " +
    "sides of splits' transfer lines (they go with the split). All of it happens in one " +
    "database transaction.",
  request: {
    params: BudgetParams,
    body: json(z.object({ selection: SelectionSchema, action: BulkActionSchema })),
  },
  responses: {
    200: ok(
      "Updated",
      z
        .object({
          updated: z.number().int(),
          before: z
            .array(TransactionSchema)
            .describe("Pre-edit rows for the caller's local undo history"),
        })
        .openapi("BulkUpdateResult"),
    ),
    400: jsonError("Invalid input, a category transactions can't use, or a closed account"),
    401: jsonError("Not signed in"),
    403: forbidden,
    404: notFound,
    409: jsonError(
      "Moving or deleting would change a transfer whose other side is reconciled " +
        "(TRANSFER_RECONCILED); nothing changed",
    ),
  },
});
