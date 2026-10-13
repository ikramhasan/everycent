import { createRouter } from "../../lib/router";
import {
  combinePayeesHandler,
  deletePayeesHandler,
  listPayeesHandler,
  listPayeeTransactionsHandler,
  restorePayeesHandler,
  setPayeesHiddenHandler,
  updatePayeeHandler,
} from "./handlers";
import {
  combinePayees,
  deletePayees,
  listPayees,
  listPayeeTransactions,
  restorePayees,
  setPayeesHidden,
  updatePayee,
} from "./routes";

export const payeesRouter = createRouter()
  .openapi(listPayees, listPayeesHandler)
  // Before `{payeeId}`, so these paths aren't read as ids.
  .openapi(listPayeeTransactions, listPayeeTransactionsHandler)
  .openapi(setPayeesHidden, setPayeesHiddenHandler)
  .openapi(combinePayees, combinePayeesHandler)
  .openapi(deletePayees, deletePayeesHandler)
  .openapi(restorePayees, restorePayeesHandler)
  .openapi(updatePayee, updatePayeeHandler);
