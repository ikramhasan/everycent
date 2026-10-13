import { createRouter } from "../../lib/router";
import {
  changeEmailHandler,
  disableTwoFactorHandler,
  getMeHandler,
  getPreferencesHandler,
  listSessionsHandler,
  revokeOtherSessionsHandler,
  revokeSessionHandler,
  updatePreferencesHandler,
} from "./handlers";
import {
  changeEmail,
  disableTwoFactor,
  getMe,
  getPreferences,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  updatePreferences,
} from "./routes";

export const meRouter = createRouter()
  .openapi(getMe, getMeHandler)
  .openapi(changeEmail, changeEmailHandler)
  .openapi(listSessions, listSessionsHandler)
  .openapi(revokeSession, revokeSessionHandler)
  .openapi(revokeOtherSessions, revokeOtherSessionsHandler)
  .openapi(disableTwoFactor, disableTwoFactorHandler)
  .openapi(getPreferences, getPreferencesHandler)
  .openapi(updatePreferences, updatePreferencesHandler);
