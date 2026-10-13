import { createRouter } from "../../lib/router";
import {
  changeEmailHandler,
  getMeHandler,
  listSessionsHandler,
  revokeOtherSessionsHandler,
  revokeSessionHandler,
} from "./handlers";
import { changeEmail, getMe, listSessions, revokeOtherSessions, revokeSession } from "./routes";

export const meRouter = createRouter()
  .openapi(getMe, getMeHandler)
  .openapi(changeEmail, changeEmailHandler)
  .openapi(listSessions, listSessionsHandler)
  .openapi(revokeSession, revokeSessionHandler)
  .openapi(revokeOtherSessions, revokeOtherSessionsHandler);
