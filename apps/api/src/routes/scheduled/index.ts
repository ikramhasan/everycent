import { createRouter } from "../../lib/router";
import { bulkUpdateScheduledTransactionsHandler } from "./bulk";
import {
  createScheduledTransactionHandler,
  deleteScheduledTransactionHandler,
  enterScheduledTransactionHandler,
  listScheduledTransactionsHandler,
  updateScheduledTransactionHandler,
} from "./handlers";
import {
  bulkUpdateScheduledTransactions,
  createScheduledTransaction,
  deleteScheduledTransaction,
  enterScheduledTransaction,
  listScheduledTransactions,
  updateScheduledTransaction,
} from "./routes";

export const scheduledRouter = createRouter()
  .openapi(listScheduledTransactions, listScheduledTransactionsHandler)
  // Before the `{scheduledTransactionId}` routes, so "bulk" isn't read as an id.
  .openapi(bulkUpdateScheduledTransactions, bulkUpdateScheduledTransactionsHandler)
  .openapi(createScheduledTransaction, createScheduledTransactionHandler)
  .openapi(updateScheduledTransaction, updateScheduledTransactionHandler)
  .openapi(deleteScheduledTransaction, deleteScheduledTransactionHandler)
  .openapi(enterScheduledTransaction, enterScheduledTransactionHandler);
