import { createRouter } from "../../lib/router";
import { importYnabFilesHandler, importYnabPlanHandler, listYnabPlansHandler } from "./handlers";
import { importYnabFiles, importYnabPlan, listYnabPlans } from "./routes";

export const ynabImportRouter = createRouter()
  .openapi(listYnabPlans, listYnabPlansHandler)
  .openapi(importYnabPlan, importYnabPlanHandler)
  .openapi(importYnabFiles, importYnabFilesHandler);
