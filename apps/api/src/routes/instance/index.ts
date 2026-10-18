import { createRouter } from "../../lib/router";
import { getInstanceHandler } from "./handlers";
import { getInstance } from "./routes";

export const instanceRouter = createRouter().openapi(getInstance, getInstanceHandler);
