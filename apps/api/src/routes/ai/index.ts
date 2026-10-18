import { createRouter } from "../../lib/router";
import {
  deleteAiAttachmentHandler,
  draftTransactionFromFileHandler,
  getAiAttachmentHandler,
  uploadAiAttachmentHandler,
} from "./attachments";
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
  deleteAiAttachment,
  deleteAiConversation,
  draftTransactionFromFile,
  getAiAttachment,
  getAiSettings,
  hydrateAiChat,
  listAiConversations,
  updateAiSettings,
  uploadAiAttachment,
} from "./routes";

export const aiRouter = createRouter()
  .openapi(getAiSettings, getAiSettingsHandler)
  .openapi(updateAiSettings, updateAiSettingsHandler)
  .openapi(listAiConversations, listAiConversationsHandler)
  .openapi(deleteAiConversation, deleteAiConversationHandler)
  .openapi(aiChat, aiChatHandler)
  .openapi(hydrateAiChat, hydrateAiChatHandler)
  .openapi(uploadAiAttachment, uploadAiAttachmentHandler)
  .openapi(getAiAttachment, getAiAttachmentHandler)
  .openapi(deleteAiAttachment, deleteAiAttachmentHandler)
  .openapi(draftTransactionFromFile, draftTransactionFromFileHandler);
