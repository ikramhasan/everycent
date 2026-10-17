import { createRouter } from "../../lib/router";
import {
  exportPlanHandler,
  exportRegisterHandler,
  exportSelectedTransactionsHandler,
} from "./handlers";
import { exportPlan, exportRegister, exportSelectedTransactions } from "./routes";

export const exportsRouter = createRouter()
  .openapi(exportPlan, exportPlanHandler)
  .openapi(exportRegister, exportRegisterHandler)
  .openapi(exportSelectedTransactions, exportSelectedTransactionsHandler);
