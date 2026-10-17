import { createRouter } from "../../lib/router";
import { reportClientErrorHandler } from "./handlers";
import { reportClientError } from "./routes";

export const clientErrorsRouter = createRouter().openapi(
  reportClientError,
  reportClientErrorHandler,
);
