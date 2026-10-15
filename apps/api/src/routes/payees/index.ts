import { createRouter } from "../../lib/router";
import {
  combinePayeesHandler,
  createPayeeRuleHandler,
  deletePayeeRuleHandler,
  deletePayeesHandler,
  listPayeeRulesHandler,
  listPayeesHandler,
  listPayeeTransactionsHandler,
  restorePayeesHandler,
  setPayeesHiddenHandler,
  updatePayeeHandler,
  updatePayeeRuleHandler,
} from "./handlers";
import {
  combinePayees,
  createPayeeRule,
  deletePayeeRule,
  deletePayees,
  listPayeeRules,
  listPayees,
  listPayeeTransactions,
  restorePayees,
  setPayeesHidden,
  updatePayee,
  updatePayeeRule,
} from "./routes";

export const payeesRouter = createRouter()
  .openapi(listPayees, listPayeesHandler)
  // Before `{payeeId}`, so these paths aren't read as ids.
  .openapi(listPayeeTransactions, listPayeeTransactionsHandler)
  .openapi(listPayeeRules, listPayeeRulesHandler)
  .openapi(updatePayeeRule, updatePayeeRuleHandler)
  .openapi(deletePayeeRule, deletePayeeRuleHandler)
  .openapi(setPayeesHidden, setPayeesHiddenHandler)
  .openapi(combinePayees, combinePayeesHandler)
  .openapi(deletePayees, deletePayeesHandler)
  .openapi(restorePayees, restorePayeesHandler)
  .openapi(createPayeeRule, createPayeeRuleHandler)
  .openapi(updatePayee, updatePayeeHandler);
