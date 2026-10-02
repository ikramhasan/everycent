import { BUDGET_MONTH_PATTERN, zCurrencyCode, zMinorUnits } from "@everycent/engine";
import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";

const zBudgetMonth = z
  .string()
  .regex(BUDGET_MONTH_PATTERN, "Expected a month as YYYY-MM")
  .describe("A month, YYYY-MM");

const Totals = z
  .object({ assigned: zMinorUnits, activity: zMinorUnits, available: zMinorUnits })
  .openapi("MonthTotals");

const MonthCategorySchema = Totals.extend({ categoryId: z.string() }).openapi("MonthCategory");
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
      .object({ activity: zMinorUnits, available: zMinorUnits })
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
