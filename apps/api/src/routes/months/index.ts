import { createRouter } from "../../lib/router";
import {
  assignCategoryHandler,
  getBudgetMonthHandler,
  listMovesHandler,
  moveMoneyHandler,
} from "./handlers";
import { assignCategory, getBudgetMonth, listMoves, moveMoney } from "./routes";

export const monthsRouter = createRouter()
  .openapi(getBudgetMonth, getBudgetMonthHandler)
  .openapi(assignCategory, assignCategoryHandler)
  .openapi(moveMoney, moveMoneyHandler)
  .openapi(listMoves, listMovesHandler);
