import { createRouter } from "../../lib/router";
import { budgetEventsHandler } from "./handlers";
import { budgetEvents } from "./routes";

export const eventsRouter = createRouter().openapi(budgetEvents, budgetEventsHandler);
