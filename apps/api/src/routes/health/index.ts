import { createRouter } from "../../lib/router";
import { getHealthHandler } from "./handlers";
import { getHealth } from "./routes";

export const healthRouter = createRouter().openapi(getHealth, getHealthHandler);
