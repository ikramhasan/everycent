import { createRouter } from "../../lib/router";
import { getBudgetMonthHandler } from "./handlers";
import { getBudgetMonth } from "./routes";

export const monthsRouter = createRouter().openapi(getBudgetMonth, getBudgetMonthHandler);
