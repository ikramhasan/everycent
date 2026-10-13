import { createRouter } from "../../lib/router";
import {
  closeAccountHandler,
  createAccountHandler,
  deleteAccountHandler,
  listAccountsHandler,
  moveAccountHandler,
  previewReconcileAccountHandler,
  reconcileAccountHandler,
  reopenAccountHandler,
  updateAccountHandler,
} from "./handlers";
import {
  dismissLoanBannerHandler,
  getLoanActivityHandler,
  recordLoanPaymentHandler,
  setLoanChargeHandler,
} from "./loans";
import {
  closeAccount,
  createAccount,
  deleteAccount,
  dismissLoanBanner,
  getLoanActivity,
  listAccounts,
  moveAccount,
  previewReconcileAccount,
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
  .openapi(previewReconcileAccount, previewReconcileAccountHandler)
  .openapi(reconcileAccount, reconcileAccountHandler)
  .openapi(closeAccount, closeAccountHandler)
  .openapi(reopenAccount, reopenAccountHandler)
  .openapi(deleteAccount, deleteAccountHandler)
  .openapi(getLoanActivity, getLoanActivityHandler)
  .openapi(setLoanCharge, setLoanChargeHandler)
  .openapi(recordLoanPayment, recordLoanPaymentHandler)
  .openapi(dismissLoanBanner, dismissLoanBannerHandler);
