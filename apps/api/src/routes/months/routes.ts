import {
  AUTO_ASSIGN_OPTIONS,
  BUDGET_MONTH_PATTERN,
  zCurrencyCode,
  zMinorUnits,
} from "@everycent/engine";
import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";

const zBudgetMonth = z
  .string()
  .regex(BUDGET_MONTH_PATTERN, "Expected a month as YYYY-MM")
  .describe("A month, YYYY-MM");

const Activity = {
  activity: zMinorUnits,
  cashActivity: zMinorUnits.describe(
    "The part of activity in cash accounts, refunds included (YNAB's Cash Spending)",
  ),
  creditActivity: zMinorUnits.describe(
    "The part of activity in credit accounts, refunds included (YNAB's Credit Spending)",
  ),
};

const Overspent = {
  cashOverspent: zMinorUnits.describe(
    "The cash part of a negative Available (taken from next month's Ready to Assign); 0 otherwise",
  ),
  creditOverspent: zMinorUnits.describe(
    "The rest of a negative Available: credit overspending, which becomes card debt; 0 otherwise",
  ),
};

const Totals = z
  .object({ assigned: zMinorUnits, ...Activity, available: zMinorUnits, ...Overspent })
  .openapi("MonthTotals");

const AutoAssignSchema = z
  .object(
    Object.fromEntries(AUTO_ASSIGN_OPTIONS.map((o) => [o, zMinorUnits])) as Record<
      (typeof AUTO_ASSIGN_OPTIONS)[number],
      typeof zMinorUnits
    >,
  )
  .describe(
    "What each Auto-Assign option would set the category's Assigned to this month: last month's " +
      "assigned or spending, the average over up to the last 12 months (from the first with money " +
      "assigned or spent), Available reset to zero, or zero",
  )
  .openapi("AutoAssignAmounts");

const PaymentSchema = z
  .object({
    balance: zMinorUnits.describe(
      "The card's working balance at the end of the month (up to today)",
    ),
    priorBalance: zMinorUnits.describe("The card's balance before the month began"),
    spendingAndOutflows: zMinorUnits.describe(
      "The month's outflows on the card (purchases, cash advances, adjustments), negative",
    ),
    paymentsAndInflows: zMinorUnits.describe(
      "The month's inflows on the card (payments, returns, statement credits), positive",
    ),
    underfunded: zMinorUnits.describe(
      "What's owed beyond what's set aside (YNAB's Total Underfunded); 0 when Available covers it",
    ),
    overspentCategories: zMinorUnits.describe(
      "The part of underfunded that is this month's credit overspending on the card",
    ),
    fundedSpending: zMinorUnits.describe(
      "Money moved in this month for funded card spending, less returns (YNAB's Funded Spending)",
    ),
    paymentsMade: zMinorUnits.describe("This month's payments to the card, negative"),
  })
  .nullable()
  .describe("Set on a credit account's payment category")
  .openapi("PaymentDetails");

const TargetNeedSchema = z
  .object({
    needed: zMinorUnits.describe(
      "What the target needs: this month's amount (weekly, monthly) or the total by its due date " +
        "(yearly, custom), or the balance to reach",
    ),
    funded: zMinorUnits.describe(
      "What counts toward it: Assigned (set aside: this month's, or the period's for dated " +
        "targets), or what was carried in plus this month's Assigned (refill, balance; carried " +
        "money counts from the user's month on); can be negative",
    ),
    underfunded: zMinorUnits.describe(
      "What's still to assign this month to stay on track; 0 when this month's share is in",
    ),
    dueDate: z.iso
      .date()
      .nullable()
      .describe("Yearly and custom: the due date of the period this month is in"),
  })
  .nullable()
  .describe(
    "The category's target this month; null without one, before it starts or after a " +
      "one-time target's due month",
  )
  .openapi("TargetNeed");

const MonthCategorySchema = Totals.extend({
  categoryId: z.string(),
  payment: PaymentSchema,
  target: TargetNeedSchema,
  autoAssign: AutoAssignSchema,
}).openapi("MonthCategory");
const MonthGroupSchema = Totals.extend({ groupId: z.string() }).openapi("MonthGroup");

const BudgetParams = z.object({
  budgetId: z.string().openapi({ param: { name: "budgetId", in: "path" } }),
  month: zBudgetMonth.openapi({ param: { name: "month", in: "path" } }),
});
const Today = z.iso
  .date()
  .describe("The user's today; later transactions don't count. Defaults to the server's UTC date.");

const MonthSchema = z
  .object({
    month: zBudgetMonth,
    currency: zCurrencyCode,
    firstMonth: zBudgetMonth.describe("The oldest month the budget shows"),
    lastMonth: zBudgetMonth.describe("The newest month the budget shows"),
    readyToAssign: zMinorUnits.describe(
      "Money without a job in this month; negative when more was assigned than there is",
    ),
    assignedInFuture: zMinorUnits.describe("Money assigned in the months after this one"),
    futureMonths: z
      .array(z.object({ month: zBudgetMonth, assigned: zMinorUnits }))
      .describe("The later months with money assigned, in order"),
    categories: z
      .array(MonthCategorySchema)
      .describe("Every category of the category list, hidden ones included"),
    groups: z
      .array(MonthGroupSchema)
      .describe("Each group's totals over its categories that aren't hidden"),
    hidden: Totals.describe("Totals of hidden categories and of every category in hidden groups"),
    uncategorized: z
      .object({ ...Activity, available: zMinorUnits, ...Overspent })
      .nullable()
      .describe("Spending without a category; null in months without any"),
  })
  .openapi("BudgetMonth");

export const getBudgetMonth = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/months/{month}",
  operationId: "getBudgetMonth",
  tags: ["Budget months"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Assigned, activity and available for each category in a month",
  description:
    "Activity counts transactions (split lines one by one) dated in the month, up to the user's " +
    "today. Available rolls over from month to month; a negative balance doesn't, the category " +
    "starts the next month at zero.",
  request: {
    params: BudgetParams,
    query: z.object({ today: Today.optional() }),
  },
  responses: {
    200: {
      description: "The month's numbers",
      content: { "application/json": { schema: MonthSchema } },
    },
    400: jsonError("Invalid month or date"),
    401: jsonError("Not signed in"),
    404: jsonError("No such budget, or the caller isn't a member"),
  },
});

export const assignCategory = createRoute({
  method: "put",
  path: "/budgets/{budgetId}/months/{month}/categories/{categoryId}",
  operationId: "assignCategory",
  tags: ["Budget months"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Set the money assigned to a category in a month",
  description:
    "Replaces the category's Assigned amount for the month. The month must be one the budget " +
    "shows; assigning in the newest month opens the one after it.",
  request: {
    params: BudgetParams.extend({
      categoryId: z.string().openapi({ param: { name: "categoryId", in: "path" } }),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              assigned: zMinorUnits.describe("The new Assigned amount; negative takes money out"),
              today: Today.optional(),
            })
            .openapi("AssignCategory"),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The month's numbers after the change",
      content: { "application/json": { schema: MonthSchema } },
    },
    400: jsonError("Invalid amount, or MONTH_OUT_OF_RANGE"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't assign money"),
    404: jsonError("No such budget or category, or the caller isn't a member"),
  },
});

export const moveMoney = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/months/{month}/moves",
  operationId: "moveMoney",
  tags: ["Budget months"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Move assigned money between categories, or to and from Ready to Assign",
  description:
    "Takes `amount` off the first category's Assigned and adds it to the second's in `month`. " +
    "Ready to Assign's internal category stands for Ready to Assign itself (its id is " +
    "`readyToAssignCategoryId` in the category list). Covering overspending and un-assigning " +
    "money are moves too.",
  request: {
    params: BudgetParams,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              fromCategoryId: z.string(),
              toCategoryId: z.string(),
              amount: zMinorUnits.describe("Positive"),
              today: Today.optional(),
            })
            .openapi("MoveMoney"),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The month's numbers after the move",
      content: { "application/json": { schema: MonthSchema } },
    },
    400: jsonError("Invalid amount or categories, or MONTH_OUT_OF_RANGE"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't assign money"),
    404: jsonError("No such budget or category, or the caller isn't a member"),
  },
});

const ActivityRowSchema = z
  .object({
    id: z.string().describe("The transaction's id, or the split line's"),
    transactionId: z.string().describe("The transaction (the split, for a split line)"),
    accountId: z.string(),
    accountName: z.string(),
    date: z.iso.date(),
    payeeName: z.string().nullable(),
    categoryId: z.string().nullable(),
    memo: z.string(),
    amount: zMinorUnits.describe("Negative is an outflow"),
  })
  .openapi("ActivityTransaction");

export const listMonthActivity = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/months/{month}/activity",
  operationId: "listMonthActivity",
  tags: ["Budget months"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "The transactions behind a category's, a group's or Uncategorized's Activity",
  description:
    "Pass exactly one of `categoryId`, `groupId` (its categories that aren't hidden, as its " +
    "totals) or `uncategorized=true`. Lists the transactions dated in the month up to the " +
    "user's today, a split's lines one by one, newest first.",
  request: {
    params: BudgetParams,
    query: z.object({
      categoryId: z.string().optional(),
      groupId: z.string().optional(),
      uncategorized: z.stringbool().optional(),
      today: Today.optional(),
    }),
  },
  responses: {
    200: {
      description: "The month's transactions for it",
      content: {
        "application/json": {
          schema: z.object({ transactions: z.array(ActivityRowSchema) }).openapi("MonthActivity"),
        },
      },
    },
    400: jsonError("Invalid month, or not exactly one of categoryId, groupId, uncategorized"),
    401: jsonError("Not signed in"),
    404: jsonError("No such budget, category or group, or the caller isn't a member"),
  },
});

export const autoAssign = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/months/{month}/auto-assign",
  operationId: "autoAssign",
  tags: ["Budget months"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Set categories' Assigned from one of YNAB's Auto-Assign options",
  description:
    "Sets each category's Assigned to the option's amount (`autoAssign` in the month). Without " +
    "`categoryIds` it covers every category that isn't hidden. Each change is a move in Recent " +
    "Moves.",
  request: {
    params: BudgetParams,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              option: z.enum(AUTO_ASSIGN_OPTIONS),
              categoryIds: z.array(z.string()).min(1).optional(),
              today: Today.optional(),
            })
            .openapi("AutoAssign"),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The month's numbers after the change",
      content: { "application/json": { schema: MonthSchema } },
    },
    400: jsonError("Invalid input, or MONTH_OUT_OF_RANGE"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't assign money"),
    404: jsonError("No such budget or category, or the caller isn't a member"),
  },
});

const MoneyMoveSchema = z
  .object({
    id: z.string(),
    kind: z
      .enum(["assigned", "moved", "removed"])
      .describe("assigned: from Ready to Assign; removed: back to it; moved: between categories"),
    fromCategoryId: z.string().nullable().describe("Null for Ready to Assign"),
    toCategoryId: z.string().nullable().describe("Null for Ready to Assign"),
    month: zBudgetMonth,
    amount: zMinorUnits.describe("Positive"),
    movedAt: z.iso.datetime(),
    userName: z.string().nullable().describe("Who moved it; null if they left the budget"),
  })
  .openapi("MoneyMove");

export const listMoves = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/moves",
  operationId: "listMoves",
  tags: ["Budget months"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Recent changes to assigned money, newest first",
  request: {
    params: z.object({
      budgetId: z.string().openapi({ param: { name: "budgetId", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "The latest moves",
      content: {
        "application/json": {
          schema: z.object({ moves: z.array(MoneyMoveSchema) }).openapi("MoneyMoveList"),
        },
      },
    },
    401: jsonError("Not signed in"),
    404: jsonError("No such budget, or the caller isn't a member"),
  },
});
