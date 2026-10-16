import { createRouter } from "../../lib/router";
import { listActivityHandler, transactionHistoryHandler } from "./handlers";
import { listActivity, transactionHistory } from "./routes";

export const activityRouter = createRouter()
  .openapi(listActivity, listActivityHandler)
  .openapi(transactionHistory, transactionHistoryHandler);
