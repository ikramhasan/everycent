import { createRouter } from "../../lib/router";
import { getAgeOfMoney, getAgeOfMoneyHandler } from "./age-of-money";
import { getReportActivityHandler, listReportTransactionsHandler } from "./handlers";
import { getReportActivity, listReportTransactions } from "./routes";

export const reportsRouter = createRouter()
  .openapi(getReportActivity, getReportActivityHandler)
  .openapi(listReportTransactions, listReportTransactionsHandler)
  .openapi(getAgeOfMoney, getAgeOfMoneyHandler);
