import { createRouter } from "../../lib/router";
import {
  dontRenameHandler,
  getImportContextHandler,
  importTransactionsHandler,
  matchTransactionsHandler,
  unmatchTransactionHandler,
} from "./handlers";
import {
  dontRenameTransaction,
  getImportContext,
  importTransactions,
  matchTransactions,
  unmatchTransaction,
} from "./routes";

export const importsRouter = createRouter()
  .openapi(getImportContext, getImportContextHandler)
  .openapi(importTransactions, importTransactionsHandler)
  .openapi(matchTransactions, matchTransactionsHandler)
  .openapi(unmatchTransaction, unmatchTransactionHandler)
  .openapi(dontRenameTransaction, dontRenameHandler);
