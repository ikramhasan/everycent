import type { RouteHandler } from "@hono/zod-openapi";
import { loadBudgetAccess } from "../../lib/budget-access";
import {
  CATEGORY_TEMPLATES,
  findCategoryTemplate,
  importCategoryTemplate as importTemplate,
  templateAmount,
  templateCategoryId,
} from "../../lib/category-templates";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import { listCategoryTree } from "../categories/queries";
import type { importCategoryTemplate, listCategoryTemplates } from "./routes";

type Env = AppEnv & AuthedEnv;

export const listCategoryTemplatesHandler: RouteHandler<typeof listCategoryTemplates, Env> = async (
  c,
) => {
  const { budgetId } = c.req.valid("param");
  const { budget } = await loadBudgetAccess(c, budgetId);
  return c.json(
    {
      templates: CATEGORY_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        categoryCount: t.groups.reduce((n, g) => n + g.categories.length, 0),
        groups: t.groups.map((g, gi) => ({
          name: g.name,
          categories: g.categories.map((cat, ci) => ({
            id: templateCategoryId(gi, ci),
            name: cat.name,
            amount: templateAmount(cat.amount, budget.currency).toString(),
          })),
        })),
      })),
    },
    200,
  );
};

export const importCategoryTemplateHandler: RouteHandler<
  typeof importCategoryTemplate,
  Env
> = async (c) => {
  const { budgetId, templateId } = c.req.valid("param");
  const { categoryIds, month } = c.req.valid("json");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId, { category: ["create"] });
  const template = findCategoryTemplate(templateId);
  const added = await db.transaction((tx) =>
    importTemplate(tx, { budgetId, currency: budget.currency, template, categoryIds, month }),
  );
  return c.json({ added, categories: await listCategoryTree(db, budgetId) }, 200);
};
