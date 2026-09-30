import { createRouter } from "../../lib/router";
import {
  createBudgetHandler,
  deleteBudgetHandler,
  getBudgetHandler,
  listBudgetsHandler,
  updateBudgetHandler,
} from "./handlers";
import { createBudget, deleteBudget, getBudget, listBudgets, updateBudget } from "./routes";

export const budgetsRouter = createRouter()
  .openapi(listBudgets, listBudgetsHandler)
  .openapi(createBudget, createBudgetHandler)
  .openapi(getBudget, getBudgetHandler)
  .openapi(updateBudget, updateBudgetHandler)
  .openapi(deleteBudget, deleteBudgetHandler);
