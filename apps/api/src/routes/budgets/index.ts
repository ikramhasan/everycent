import { createRouter } from "../../lib/router";
import {
  createBudgetHandler,
  deleteBudgetHandler,
  freshStartBudgetHandler,
  getBudgetHandler,
  listBudgetsHandler,
  updateBudgetHandler,
} from "./handlers";
import {
  createBudget,
  deleteBudget,
  freshStartBudget,
  getBudget,
  listBudgets,
  updateBudget,
} from "./routes";

export const budgetsRouter = createRouter()
  .openapi(listBudgets, listBudgetsHandler)
  .openapi(createBudget, createBudgetHandler)
  .openapi(getBudget, getBudgetHandler)
  .openapi(updateBudget, updateBudgetHandler)
  .openapi(deleteBudget, deleteBudgetHandler)
  .openapi(freshStartBudget, freshStartBudgetHandler);
