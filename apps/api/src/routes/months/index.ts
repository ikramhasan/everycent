import { createRouter } from "../../lib/router";
import { assignCategoryHandler, getBudgetMonthHandler } from "./handlers";
import { assignCategory, getBudgetMonth } from "./routes";

export const monthsRouter = createRouter()
  .openapi(getBudgetMonth, getBudgetMonthHandler)
  .openapi(assignCategory, assignCategoryHandler);
