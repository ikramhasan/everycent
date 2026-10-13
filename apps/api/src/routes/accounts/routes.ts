import {
  LOAN_CHARGE_KINDS,
  LOAN_LINE_KINDS,
  zAccountType,
  zBudgetMonth,
  zCurrencyCode,
  zMinorUnits,
} from "@everycent/engine";
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
    lastReconciledAt: z.iso
      .datetime()
      .nullable()
      .describe("When the account was last reconciled; null if never"),
    pairedCategoryId: z
      .string()
      .nullable()
      .describe("Loan accounts: the plan category paired with it (its payments' category)"),
    lastPaymentDate: IsoDate.nullable().describe(
      "Loan accounts: the date of the latest payment up to today",
    ),
    lastPaymentFromAccountId: z
      .string()
      .nullable()
      .describe(
        "Loan accounts: the cash or credit account of the payment into it entered last " +
          "(Record Payment starts there)",
      ),
  })
  .openapi("Account");

const PairedCategoryId = z
  .string()
  .describe(
    "Pair this plan category with the loan (one loan per category: pairing a category moves it " +
      "from any other loan). Not an internal or credit card payment category.",
  );

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
    403: jsonError("The account's email address isn't confirmed"),
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
          pairedCategoryId: PairedCategoryId.optional(),
        })
        .openapi("CreateAccount"),
    ),
  },
  responses: {
    201: ok("Created", AccountSchema),
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError(
      "The caller's role can't manage accounts, or the account's email address isn't confirmed",
    ),
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
  summary: "Rename an account, edit its note, type or loan details, or set its working balance",
  description:
    "A `workingBalance` different from the account's adds a Manual Balance Adjustment for the " +
    "difference, dated `date` and cleared (as YNAB's Edit Account does; budget accounts take it " +
    "from Ready to Assign). Not for closed accounts. A loan's interest rate, minimum payment and " +
    "escrow apply from `date`'s month on.",
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
          pairedCategoryId: PairedCategoryId.nullable().optional().describe("Null unpairs"),
          workingBalance: zMinorUnits
            .optional()
            .describe("The balance the account should have; negative for money owed"),
          date: IsoDate.optional().describe(
            "The user's today: the adjustment's date, the day the working balance is read at, " +
              "and the month new loan terms start in. Defaults to the server's UTC date.",
          ),
        })
        .openapi("UpdateAccount"),
    ),
  },
  responses: {
    200: ok("Updated", AccountSchema),
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError(
      "The caller's role can't manage accounts, or the account's email address isn't confirmed",
    ),
    404: notFound,
  },
});

export const reconcileAccount = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/accounts/{accountId}/reconcile",
  operationId: "reconcileAccount",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Reconcile an account against the bank's balance",
  description:
    "Locks every cleared transaction dated up to `date` (they become reconciled, for good) and " +
    "records when. If `balance` differs from the cleared balance, a Reconciliation Balance " +
    "Adjustment for the difference comes first, dated `date` (budget accounts take it from " +
    "Ready to Assign; tracking accounts have no category). A loan (YNAB's Update Balance) is " +
    "compared with its working balance, every transaction up to `date` is reconciled, and each " +
    "month's interest and escrow are fixed at what's applied.",
  request: {
    params: AccountParams,
    body: json(
      z
        .object({
          balance: zMinorUnits.describe(
            "The bank's current cleared balance (a loan's: what's owed), signed like the account's " +
              "(negative for money owed)",
          ),
          date: IsoDate.describe("The user's today"),
        })
        .openapi("ReconcileAccount"),
    ),
  },
  responses: {
    200: ok("Reconciled", AccountSchema),
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError(
      "The caller's role can't change transactions, or the account's email address isn't confirmed",
    ),
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
    403: jsonError(
      "The caller's role can't manage accounts, or the account's email address isn't confirmed",
    ),
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
    403: jsonError(
      "The caller's role can't manage accounts, or the account's email address isn't confirmed",
    ),
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
    403: jsonError(
      "The caller's role can't manage accounts, or the account's email address isn't confirmed",
    ),
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
    403: jsonError(
      "The caller's role can't manage accounts, or the account's email address isn't confirmed",
    ),
    404: notFound,
    409: jsonError("ACCOUNT_HAS_HISTORY: close the account instead"),
  },
});

const LoanChargeSchema = z
  .object({
    total: zMinorUnits.describe("The month's full charge: the estimate, or what was set"),
    applied: zMinorUnits.describe("The part the month's payments covered (all of a set amount)"),
    status: z.enum(["estimated", "edited", "reconciled"]),
    editedAt: z.iso.datetime().nullable().describe("When it was set (edited or reconciled)"),
  })
  .openapi("LoanCharge");

const LoanActivitySchema = z
  .object({
    months: z
      .array(
        z.object({
          month: zBudgetMonth,
          startBalance: zMinorUnits.describe("Balance at the end of the previous month"),
          endBalance: zMinorUnits,
          payments: zMinorUnits.describe("Total of the month's payments"),
          interest: LoanChargeSchema,
          escrow: LoanChargeSchema,
          transactions: z.array(
            z.object({
              id: z.string(),
              date: IsoDate,
              amount: zMinorUnits,
              memo: z.string(),
              kind: z.enum(LOAN_LINE_KINDS),
              payeeKind: z
                .string()
                .nullable()
                .describe("Internal payee kind (e.g. a balance adjustment), if any"),
              fromAccountId: z.string().nullable().describe("Payments: the paying account"),
              otherSideId: z.string().nullable().describe("Payments: the paying side's id"),
            }),
          ),
        }),
      )
      .describe("From the loan's first month through today's, oldest first"),
    terms: z
      .array(
        z.object({
          month: zBudgetMonth,
          interestRate: z.string().nullable().describe("Annual rate in percent"),
          minimumPayment: zMinorUnits.nullable(),
          escrowAmount: zMinorUnits.nullable(),
        }),
      )
      .describe(
        "The loan's interest rate, minimum payment and escrow from each month on, oldest first " +
          "(months before the first entry use it), for the payoff planner",
      ),
  })
  .openapi("LoanActivity");

export const getLoanActivity = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/accounts/{accountId}/loan",
  operationId: "getLoanActivity",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "A loan's month-by-month activity: payments, interest, escrow and balances",
  description:
    "Interest is estimated each month that has payments as the previous month's balance × rate " +
    "÷ 12 (rounded half up); escrow comes first, then interest, both capped by the month's " +
    "payments. Amounts set by hand or fixed by Update Balance apply in full.",
  request: {
    params: AccountParams,
    query: z.object({ today: IsoDate.optional().describe("The user's today") }),
  },
  responses: {
    200: ok("The loan's months", LoanActivitySchema),
    400: jsonError("Not a loan account"),
    401: jsonError("Not signed in"),
    403: jsonError("The account's email address isn't confirmed"),
    404: notFound,
  },
});

export const setLoanCharge = createRoute({
  method: "put",
  path: "/budgets/{budgetId}/accounts/{accountId}/loan/charges",
  operationId: "setLoanCharge",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Set a loan month's total interest or escrow",
  description:
    "Replaces the month's estimate (or earlier amount) and applies in full, payments or not, as " +
    "YNAB's Edit Interest, Edit Escrow and Add Interest do; zero is YNAB's Delete Interest. " +
    "Months run from the loan's first through today's.",
  request: {
    params: AccountParams,
    body: json(
      z
        .object({
          month: zBudgetMonth,
          kind: z.enum(LOAN_CHARGE_KINDS),
          amount: zMinorUnits.describe("Minor units added to the debt; not negative"),
          today: IsoDate.describe("The user's today"),
        })
        .openapi("SetLoanCharge"),
    ),
  },
  responses: {
    200: ok("The loan's months", LoanActivitySchema),
    400: jsonError("Not a loan, a negative amount, or a month outside the loan's"),
    401: jsonError("Not signed in"),
    403: jsonError(
      "The caller's role can't change transactions, or the account's email address isn't confirmed",
    ),
    404: notFound,
  },
});

export const recordLoanPayment = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/accounts/{accountId}/loan/payments",
  operationId: "recordLoanPayment",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Record a loan payment (YNAB's Record Payment)",
  description:
    "A transfer from `fromAccountId` into the loan: the paying side is uncleared and comes out " +
    "of the loan's paired category (Uncategorized when it has none); the loan's side is cleared.",
  request: {
    params: AccountParams,
    body: json(
      z
        .object({
          fromAccountId: z.string().describe("A budget (cash or credit) account"),
          amount: zMinorUnits.describe("What's paid; positive"),
          date: IsoDate,
          memo: z.string().max(500).default(""),
        })
        .openapi("RecordLoanPayment"),
    ),
  },
  responses: {
    201: ok("Recorded", AccountSchema),
    400: jsonError("Not a loan, not a budget account to pay from, or not a positive amount"),
    401: jsonError("Not signed in"),
    403: jsonError(
      "The caller's role can't change transactions, or the account's email address isn't confirmed",
    ),
    404: notFound,
  },
});
