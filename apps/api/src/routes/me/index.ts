import { createRouter } from "../../lib/router";
import {
  changeEmailHandler,
  disableTwoFactorHandler,
  getMeHandler,
  listSessionsHandler,
  revokeOtherSessionsHandler,
  revokeSessionHandler,
} from "./handlers";
import {
  changeEmail,
  disableTwoFactor,
  getMe,
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from "./routes";

export const meRouter = createRouter()
  .openapi(getMe, getMeHandler)
  .openapi(changeEmail, changeEmailHandler)
  .openapi(listSessions, listSessionsHandler)
  .openapi(revokeSession, revokeSessionHandler)
  .openapi(revokeOtherSessions, revokeOtherSessionsHandler)
  .openapi(disableTwoFactor, disableTwoFactorHandler);
