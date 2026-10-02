import type { components } from "@everycent/api-client";
import type { Transaction } from "./transactions";

export type CreateTransactionBody = components["schemas"]["CreateTransaction"];
export type UpdateTransactionBody = components["schemas"]["UpdateTransaction"];

/** A complete transaction representation accepted by the create endpoint. */
export function createBodyFromTransaction(transaction: Transaction): CreateTransactionBody {
  return {
    accountId: transaction.accountId,
    date: transaction.date,
    amount: transaction.amount,
    ...(transaction.transferAccountId
      ? { payeeName: null, transferAccountId: transaction.transferAccountId }
      : { payeeName: transaction.payeeName }),
    categoryId: transaction.subtransactions.length > 0 ? null : transaction.categoryId,
    memo: transaction.memo,
    cleared: transaction.cleared === "uncleared" ? "uncleared" : "cleared",
    flag: transaction.flag,
    ...(transaction.subtransactions.length > 0
      ? {
          subtransactions: transaction.subtransactions.map((line) => ({
            amount: line.amount,
            ...(line.transferAccountId
              ? { payeeName: null, transferAccountId: line.transferAccountId }
              : { payeeName: line.payeeName }),
            categoryId: line.categoryId,
            memo: line.memo,
          })),
        }
      : {}),
  };
}

/** Every mutable field, used to restore a transaction after an edit. */
export function updateBodyFromTransaction(transaction: Transaction): UpdateTransactionBody {
  return {
    accountId: transaction.accountId,
    date: transaction.date,
    amount: transaction.amount,
    ...(transaction.transferAccountId
      ? { transferAccountId: transaction.transferAccountId }
      : { payeeName: transaction.payeeName }),
    categoryId: transaction.subtransactions.length > 0 ? undefined : transaction.categoryId,
    memo: transaction.memo,
    cleared: transaction.cleared === "uncleared" ? "uncleared" : "cleared",
    flag: transaction.flag,
    ...(transaction.subtransactions.length > 0
      ? {
          subtransactions: transaction.subtransactions.map((line) => ({
            id: line.id,
            amount: line.amount,
            ...(line.transferAccountId
              ? { payeeName: null, transferAccountId: line.transferAccountId }
              : { payeeName: line.payeeName }),
            categoryId: line.categoryId,
            memo: line.memo,
          })),
        }
      : {}),
  };
}
