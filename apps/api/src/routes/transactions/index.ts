import { createRouter } from "../../lib/router";
import {
  deleteAttachmentHandler,
  getAttachmentHandler,
  uploadAttachmentHandler,
} from "./attachments";
import { bulkUpdateTransactionsHandler, summarizeSelectionHandler } from "./bulk";
import {
  createTransactionHandler,
  deleteTransactionHandler,
  listTransactionsHandler,
  updateTransactionHandler,
} from "./handlers";
import {
  bulkUpdateTransactions,
  createTransaction,
  deleteAttachment,
  deleteTransaction,
  getAttachment,
  listTransactions,
  summarizeSelection,
  updateTransaction,
  uploadAttachment,
} from "./routes";

export const transactionsRouter = createRouter()
  .openapi(listTransactions, listTransactionsHandler)
  // Before the `{transactionId}` routes, so these paths aren't read as ids.
  .openapi(summarizeSelection, summarizeSelectionHandler)
  .openapi(bulkUpdateTransactions, bulkUpdateTransactionsHandler)
  .openapi(createTransaction, createTransactionHandler)
  .openapi(updateTransaction, updateTransactionHandler)
  .openapi(deleteTransaction, deleteTransactionHandler)
  .openapi(uploadAttachment, uploadAttachmentHandler)
  .openapi(getAttachment, getAttachmentHandler)
  .openapi(deleteAttachment, deleteAttachmentHandler);
