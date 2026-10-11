import { createRouter } from "../../lib/router";
import {
  closeAccountHandler,
  createAccountHandler,
  deleteAccountHandler,
  listAccountsHandler,
  moveAccountHandler,
  reconcileAccountHandler,
  reopenAccountHandler,
  updateAccountHandler,
} from "./handlers";
import {
  closeAccount,
  createAccount,
  deleteAccount,
  listAccounts,
  moveAccount,
  reconcileAccount,
  reopenAccount,
  updateAccount,
} from "./routes";

export const accountsRouter = createRouter()
  .openapi(listAccounts, listAccountsHandler)
  .openapi(createAccount, createAccountHandler)
  .openapi(updateAccount, updateAccountHandler)
  .openapi(moveAccount, moveAccountHandler)
  .openapi(reconcileAccount, reconcileAccountHandler)
  .openapi(closeAccount, closeAccountHandler)
  .openapi(reopenAccount, reopenAccountHandler)
  .openapi(deleteAccount, deleteAccountHandler);
