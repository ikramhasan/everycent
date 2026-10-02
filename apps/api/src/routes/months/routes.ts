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

const MonthSchema = z
  .object({
    month: zBudgetMonth,
    currency: zCurrencyCode,
    firstMonth: zBudgetMonth.describe("The oldest month the budget shows"),
    lastMonth: zBudgetMonth.describe("The newest month the budget shows"),
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
    params: z.object({
      budgetId: z.string().openapi({ param: { name: "budgetId", in: "path" } }),
      month: zBudgetMonth.openapi({ param: { name: "month", in: "path" } }),
    }),
    query: z.object({
      today: z.iso
        .date()
        .optional()
        .describe(
          "The user's today; later transactions don't count. Defaults to the server's UTC date.",
        ),
    }),
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
