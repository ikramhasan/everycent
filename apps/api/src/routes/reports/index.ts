import { createRouter } from "../../lib/router";
import { getReportActivityHandler, listReportTransactionsHandler } from "./handlers";
import { getReportActivity, listReportTransactions } from "./routes";

export const reportsRouter = createRouter()
  .openapi(getReportActivity, getReportActivityHandler)
  .openapi(listReportTransactions, listReportTransactionsHandler);
