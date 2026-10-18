import { createRouter } from "../../lib/router";
import {
  aiChatHandler,
  deleteAiConversationHandler,
  getAiSettingsHandler,
  hydrateAiChatHandler,
  listAiConversationsHandler,
  updateAiSettingsHandler,
} from "./handlers";
import {
  aiChat,
  deleteAiConversation,
  getAiSettings,
  hydrateAiChat,
  listAiConversations,
  updateAiSettings,
} from "./routes";

export const aiRouter = createRouter()
  .openapi(getAiSettings, getAiSettingsHandler)
  .openapi(updateAiSettings, updateAiSettingsHandler)
  .openapi(listAiConversations, listAiConversationsHandler)
  .openapi(deleteAiConversation, deleteAiConversationHandler)
  .openapi(aiChat, aiChatHandler)
  .openapi(hydrateAiChat, hydrateAiChatHandler);
