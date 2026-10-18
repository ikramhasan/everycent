import { createRouter } from "../../lib/router";
import { getAgeOfMoney, getAgeOfMoneyHandler } from "./age-of-money";
import { getBudgetVsActual, getBudgetVsActualHandler } from "./budget-vs-actual";
import { getReportActivityHandler, listReportTransactionsHandler } from "./handlers";
import { getNetWorthReport, getNetWorthReportHandler } from "./net-worth";
import { getReportActivity, listReportTransactions } from "./routes";
import {
  getSpendingPace,
  getSpendingPaceHandler,
  setCategoryPace,
  setCategoryPaceHandler,
} from "./spending-pace";

export const reportsRouter = createRouter()
  .openapi(getReportActivity, getReportActivityHandler)
  .openapi(listReportTransactions, listReportTransactionsHandler)
  .openapi(getNetWorthReport, getNetWorthReportHandler)
  .openapi(getAgeOfMoney, getAgeOfMoneyHandler)
  .openapi(getBudgetVsActual, getBudgetVsActualHandler)
  .openapi(getSpendingPace, getSpendingPaceHandler)
  .openapi(setCategoryPace, setCategoryPaceHandler);
