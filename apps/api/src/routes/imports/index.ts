import { createRouter } from "../../lib/router";
import { getImportContextHandler, importTransactionsHandler } from "./handlers";
import { getImportContext, importTransactions } from "./routes";

export const importsRouter = createRouter()
  .openapi(getImportContext, getImportContextHandler)
  .openapi(importTransactions, importTransactionsHandler);
