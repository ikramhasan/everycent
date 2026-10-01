import { CATEGORY_GROUP_KINDS } from "@everycent/db/schema";
import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";

const Name = z.string().trim().min(1).max(100);
const Note = z.string().max(10_000);

export const CategorySchema = z
  .object({
    id: z.string(),
    groupId: z.string(),
    name: z.string(),
    note: z.string(),
    hidden: z.boolean(),
    linkedAccountId: z
      .string()
      .nullable()
      .describe("Set on a credit account's payment category, which is named after the account"),
    hasTransactions: z.boolean().describe("Deleting it requires reassignToCategoryId"),
  })
  .openapi("Category");

export const CategoryGroupSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    hidden: z.boolean(),
    kind: z
      .enum(CATEGORY_GROUP_KINDS)
      .nullable()
      .describe("credit_card_payments: managed by YNAB rules, listed first"),
    categories: z.array(CategorySchema).describe("In display order, hidden ones included"),
  })
  .openapi("CategoryGroup");

const CategoryListSchema = z
  .object({
    groups: z.array(CategoryGroupSchema).describe("In display order"),
    readyToAssignCategoryId: z
      .string()
      .describe("The internal 'Inflow: Ready to Assign' category, for categorizing income"),
  })
  .openapi("CategoryList");

const BudgetParams = z.object({
  budgetId: z.string().openapi({ param: { name: "budgetId", in: "path" } }),
});
const GroupParams = BudgetParams.extend({
  groupId: z.string().openapi({ param: { name: "groupId", in: "path" } }),
});
const CategoryParams = BudgetParams.extend({
  categoryId: z.string().openapi({ param: { name: "categoryId", in: "path" } }),
});

function json<T extends z.ZodType>(schema: T) {
  return { required: true, content: { "application/json": { schema } } } as const;
}

const ReassignQuery = z.object({
  reassignToCategoryId: z
    .string()
    .optional()
    .openapi({
      param: { name: "reassignToCategoryId", in: "query" },
      description: "Required when the category (or a category in the group) has transactions",
    }),
});
const managed = jsonError(
  "MANAGED_CATEGORY: not allowed on Credit Card Payments; CATEGORY_HAS_HISTORY: pass reassignToCategoryId",
);

const notFound = jsonError("No such budget, group or category, or the caller isn't a member");

export const listCategories = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/categories",
  operationId: "listCategories",
  tags: ["Categories"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Category groups with their categories, in display order",
  request: { params: BudgetParams },
  responses: {
    200: {
      description: "The budget's categories (internal ones excluded)",
      content: { "application/json": { schema: CategoryListSchema } },
    },
    401: jsonError("Not signed in"),
    404: notFound,
  },
});

export const createCategoryGroup = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/category-groups",
  operationId: "createCategoryGroup",
  tags: ["Categories"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Add a category group at the end of the list",
  request: {
    params: BudgetParams,
    body: json(z.object({ name: Name }).openapi("CreateCategoryGroup")),
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: CategoryGroupSchema } },
    },
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't edit categories"),
    404: notFound,
    409: managed,
  },
});

export const updateCategoryGroup = createRoute({
  method: "patch",
  path: "/budgets/{budgetId}/category-groups/{groupId}",
  operationId: "updateCategoryGroup",
  tags: ["Categories"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Rename, hide or unhide a category group",
  request: {
    params: GroupParams,
    body: json(
      z
        .strictObject({ name: Name.optional(), hidden: z.boolean().optional() })
        .openapi("UpdateCategoryGroup"),
    ),
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: CategoryGroupSchema } },
    },
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't edit categories"),
    404: notFound,
    409: managed,
  },
});

export const deleteCategoryGroup = createRoute({
  method: "delete",
  path: "/budgets/{budgetId}/category-groups/{groupId}",
  operationId: "deleteCategoryGroup",
  tags: ["Categories"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Delete a category group and its categories",
  request: { params: GroupParams, query: ReassignQuery },
  responses: {
    204: { description: "Deleted" },
    400: jsonError("Invalid reassignment target"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't edit categories"),
    404: notFound,
    409: managed,
  },
});

export const moveCategoryGroup = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/category-groups/{groupId}/move",
  operationId: "moveCategoryGroup",
  tags: ["Categories"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Move a category group before another one, or to the end",
  request: {
    params: GroupParams,
    body: json(
      z
        .object({
          beforeGroupId: z
            .string()
            .nullable()
            .describe("Place the group right before this one; null moves it to the end"),
        })
        .openapi("MoveCategoryGroup"),
    ),
  },
  responses: {
    200: {
      description: "The categories in their new order",
      content: { "application/json": { schema: CategoryListSchema } },
    },
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't edit categories"),
    404: notFound,
    409: managed,
  },
});

export const createCategory = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/categories",
  operationId: "createCategory",
  tags: ["Categories"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Add a category at the end of a group",
  request: {
    params: BudgetParams,
    body: json(z.object({ groupId: z.string(), name: Name }).openapi("CreateCategory")),
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: CategorySchema } } },
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't edit categories"),
    404: notFound,
    409: managed,
  },
});

export const updateCategory = createRoute({
  method: "patch",
  path: "/budgets/{budgetId}/categories/{categoryId}",
  operationId: "updateCategory",
  tags: ["Categories"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Rename a category, change its note, or hide/unhide it",
  request: {
    params: CategoryParams,
    body: json(
      z
        .strictObject({
          name: Name.optional(),
          note: Note.optional(),
          hidden: z.boolean().optional(),
        })
        .openapi("UpdateCategory"),
    ),
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: CategorySchema } } },
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't edit categories"),
    404: notFound,
    409: managed,
  },
});

export const deleteCategory = createRoute({
  method: "delete",
  path: "/budgets/{budgetId}/categories/{categoryId}",
  operationId: "deleteCategory",
  tags: ["Categories"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Delete a category, moving its history to another category",
  request: { params: CategoryParams, query: ReassignQuery },
  responses: {
    204: { description: "Deleted" },
    400: jsonError("Invalid reassignment target"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't edit categories"),
    404: notFound,
    409: managed,
  },
});

export const moveCategory = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/categories/{categoryId}/move",
  operationId: "moveCategory",
  tags: ["Categories"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Move a category within its group or into another group",
  request: {
    params: CategoryParams,
    body: json(
      z
        .object({
          groupId: z.string().describe("The group to move the category into"),
          beforeCategoryId: z
            .string()
            .nullable()
            .describe(
              "Place it right before this category in that group; null moves it to the end",
            ),
        })
        .openapi("MoveCategory"),
    ),
  },
  responses: {
    200: {
      description: "The categories in their new order",
      content: { "application/json": { schema: CategoryListSchema } },
    },
    400: jsonError("Invalid input"),
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't edit categories"),
    404: notFound,
    409: managed,
  },
});
