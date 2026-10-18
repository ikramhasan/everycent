import { createRouter } from "../../lib/router";
import {
  getNotificationsHandler,
  unsubscribeEmailHandler,
  updateNotificationsHandler,
} from "./handlers";
import { getNotifications, unsubscribeEmail, updateNotifications } from "./routes";

export const notificationsRouter = createRouter()
  .openapi(getNotifications, getNotificationsHandler)
  .openapi(updateNotifications, updateNotificationsHandler)
  .openapi(unsubscribeEmail, unsubscribeEmailHandler);
