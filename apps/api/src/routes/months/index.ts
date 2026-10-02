import { createRouter } from "../../lib/router";
import { listMonthActivityHandler } from "./activity";
import {
  assignCategoryHandler,
  autoAssignHandler,
  getBudgetMonthHandler,
  listMovesHandler,
  moveMoneyHandler,
} from "./handlers";
import {
  assignCategory,
  autoAssign,
  getBudgetMonth,
  listMonthActivity,
  listMoves,
  moveMoney,
} from "./routes";

export const monthsRouter = createRouter()
  .openapi(getBudgetMonth, getBudgetMonthHandler)
  .openapi(assignCategory, assignCategoryHandler)
  .openapi(moveMoney, moveMoneyHandler)
  .openapi(autoAssign, autoAssignHandler)
  .openapi(listMonthActivity, listMonthActivityHandler)
  .openapi(listMoves, listMovesHandler);
