import { createRouter } from "../../lib/router";
import {
  getImportContextHandler,
  importTransactionsHandler,
  matchTransactionsHandler,
  unmatchTransactionHandler,
} from "./handlers";
import {
  getImportContext,
  importTransactions,
  matchTransactions,
  unmatchTransaction,
} from "./routes";

export const importsRouter = createRouter()
  .openapi(getImportContext, getImportContextHandler)
  .openapi(importTransactions, importTransactionsHandler)
  .openapi(matchTransactions, matchTransactionsHandler)
  .openapi(unmatchTransaction, unmatchTransactionHandler);
