import { createRouter } from "../../lib/router";
import { importCategoryTemplateHandler, listCategoryTemplatesHandler } from "./handlers";
import { importCategoryTemplate, listCategoryTemplates } from "./routes";

export const categoryTemplatesRouter = createRouter()
  .openapi(listCategoryTemplates, listCategoryTemplatesHandler)
  .openapi(importCategoryTemplate, importCategoryTemplateHandler);
