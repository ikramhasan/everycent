import { createRouter } from "../../lib/router";
import {
  createTransactionHandler,
  deleteTransactionHandler,
  listPayeesHandler,
  listTransactionsHandler,
  updateTransactionHandler,
} from "./handlers";
import {
  createTransaction,
  deleteTransaction,
  listPayees,
  listTransactions,
  updateTransaction,
} from "./routes";

export const transactionsRouter = createRouter()
  .openapi(listTransactions, listTransactionsHandler)
  .openapi(createTransaction, createTransactionHandler)
  .openapi(updateTransaction, updateTransactionHandler)
  .openapi(deleteTransaction, deleteTransactionHandler)
  .openapi(listPayees, listPayeesHandler);
