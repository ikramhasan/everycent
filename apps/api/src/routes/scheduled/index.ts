import { createRouter } from "../../lib/router";
import {
  createScheduledTransactionHandler,
  deleteScheduledTransactionHandler,
  enterScheduledTransactionHandler,
  listScheduledTransactionsHandler,
  updateScheduledTransactionHandler,
} from "./handlers";
import {
  createScheduledTransaction,
  deleteScheduledTransaction,
  enterScheduledTransaction,
  listScheduledTransactions,
  updateScheduledTransaction,
} from "./routes";

export const scheduledRouter = createRouter()
  .openapi(listScheduledTransactions, listScheduledTransactionsHandler)
  .openapi(createScheduledTransaction, createScheduledTransactionHandler)
  .openapi(updateScheduledTransaction, updateScheduledTransactionHandler)
  .openapi(deleteScheduledTransaction, deleteScheduledTransactionHandler)
  .openapi(enterScheduledTransaction, enterScheduledTransactionHandler);
