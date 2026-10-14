import { createRouter } from "../../lib/router";
import { listMonthActivityHandler } from "./activity";
import {
  assignCategoryHandler,
  autoAssignHandler,
  getBudgetMonthHandler,
  listMonthMovesHandler,
  listMovesHandler,
  moveMoneyHandler,
  setExpectedIncomeHandler,
  setMonthNoteHandler,
} from "./handlers";
import {
  assignCategory,
  autoAssign,
  getBudgetMonth,
  listMonthActivity,
  listMonthMoves,
  listMoves,
  moveMoney,
  setExpectedIncome,
  setMonthNote,
} from "./routes";

export const monthsRouter = createRouter()
  .openapi(getBudgetMonth, getBudgetMonthHandler)
  .openapi(assignCategory, assignCategoryHandler)
  .openapi(setMonthNote, setMonthNoteHandler)
  .openapi(moveMoney, moveMoneyHandler)
  .openapi(autoAssign, autoAssignHandler)
  .openapi(listMonthActivity, listMonthActivityHandler)
  .openapi(listMoves, listMovesHandler)
  .openapi(listMonthMoves, listMonthMovesHandler)
  .openapi(setExpectedIncome, setExpectedIncomeHandler);
