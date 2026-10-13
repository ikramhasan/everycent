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
import { getLoanActivityHandler, recordLoanPaymentHandler, setLoanChargeHandler } from "./loans";
import {
  closeAccount,
  createAccount,
  deleteAccount,
  getLoanActivity,
  listAccounts,
  moveAccount,
  reconcileAccount,
  recordLoanPayment,
  reopenAccount,
  setLoanCharge,
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
  .openapi(deleteAccount, deleteAccountHandler)
  .openapi(getLoanActivity, getLoanActivityHandler)
  .openapi(setLoanCharge, setLoanChargeHandler)
  .openapi(recordLoanPayment, recordLoanPaymentHandler);
