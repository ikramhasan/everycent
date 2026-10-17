import { createHash } from "node:crypto";
import type { RouteHandler } from "@hono/zod-openapi";
import { loadBudgetAccess } from "../../lib/budget-access";
import { httpYnabClient } from "../../lib/ynab/client";
import { fromYnabApi } from "../../lib/ynab/from-api";
import { csvAccounts, fromYnabCsv } from "../../lib/ynab/from-csv";
import { importConverted, type YnabImportResult } from "../../lib/ynab/import";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import { toBudgetJson } from "../budgets/handlers";
import type { importYnabFiles, importYnabPlan, listYnabPlans } from "./routes";

type Env = AppEnv & AuthedEnv;

export const listYnabPlansHandler: RouteHandler<typeof listYnabPlans, Env> = async (c) => {
  const { token } = c.req.valid("json");
  const client = c.var.deps.ynab ?? httpYnabClient();
  const plans = await client.listPlans(token);
  return c.json(
    {
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        lastModifiedOn: p.last_modified_on ?? null,
      })),
    },
    200,
  );
};

// biome-ignore lint/suspicious/noExplicitAny: any route's context
async function report(c: Parameters<RouteHandler<any, Env>>[0], result: YnabImportResult) {
  const access = await loadBudgetAccess(c, result.budgetId);
  return {
    budget: toBudgetJson(access),
    reused: result.reused,
    counts: result.counts,
    warnings: result.warnings,
  };
}

export const importYnabPlanHandler: RouteHandler<typeof importYnabPlan, Env> = async (c) => {
  const { token, planId, name, replace } = c.req.valid("json");
  const client = c.var.deps.ynab ?? httpYnabClient();
  const plan = await client.getPlan(token, planId);
  const result = await importConverted(c, fromYnabApi(plan), {
    source: `ynab:${plan.id}`,
    name,
    replace,
  });
  return c.json(await report(c, result), result.reused ? 200 : 201);
};

export const importYnabFilesHandler: RouteHandler<typeof importYnabFiles, Env> = async (c) => {
  const body = c.req.valid("json");
  if (body.dryRun) {
    return c.json({ accounts: csvAccounts(body.register, body.plan, body) }, 200);
  }
  const conversion = fromYnabCsv(
    { plan: body.plan, register: body.register, name: body.name },
    body,
  );
  const hash = createHash("sha256")
    .update(body.plan)
    .update("\0")
    .update(body.register)
    .digest("hex");
  const result = await importConverted(c, conversion, {
    source: `ynab-files:${hash}`,
    replace: body.replace,
  });
  return c.json(await report(c, result), result.reused ? 200 : 201);
};
