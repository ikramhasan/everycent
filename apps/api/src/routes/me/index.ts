import { createRouter } from "../../lib/router";
import { getMeHandler } from "./handlers";
import { getMe } from "./routes";

export const meRouter = createRouter().openapi(getMe, getMeHandler);
