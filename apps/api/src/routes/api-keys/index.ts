import { createRouter } from "../../lib/router";
import { createApiKeyHandler, deleteApiKeyHandler, listApiKeysHandler } from "./handlers";
import { createApiKey, deleteApiKey, listApiKeys } from "./routes";

export const apiKeysRouter = createRouter()
  .openapi(listApiKeys, listApiKeysHandler)
  .openapi(createApiKey, createApiKeyHandler)
  .openapi(deleteApiKey, deleteApiKeyHandler);
