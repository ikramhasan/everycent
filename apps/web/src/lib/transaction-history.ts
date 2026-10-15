import type { components } from "@everycent/api-client";
import type { Transaction } from "./transactions";

export type CreateTransactionBody = components["schemas"]["CreateTransaction"];
export type UpdateTransactionBody = components["schemas"]["UpdateTransaction"];

/**
 * A complete transaction representation accepted by the create endpoint, to bring a deleted one
 * back (undo) or create it again (redo). As YNAB's Undo does (2026-10-14), a transfer's other
 * side comes back with its own memo, cleared state, flag and approval, and a transfer to an
 * account closed since still comes back (`restore`).
 */
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
    // Restoring a deleted reconciled transaction brings it back reconciled.
    cleared: transaction.cleared,
    flag: transaction.flag,
    approved: transaction.approved,
    ...(transaction.transferAccountId && transaction.transferSide
      ? { transferSide: transaction.transferSide }
      : {}),
    ...(transaction.subtransactions.length > 0
      ? {
          subtransactions: transaction.subtransactions.map((line) => ({
            amount: line.amount,
            ...(line.transferAccountId
              ? {
                  payeeName: null,
                  transferAccountId: line.transferAccountId,
                  ...(line.transferSide ? { transferSide: line.transferSide } : {}),
                }
              : { payeeName: line.payeeName }),
            categoryId: line.categoryId,
            memo: line.memo,
          })),
        }
      : {}),
    restore: true,
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
    // A reconciled transaction stays reconciled; its cleared state can't be set.
    ...(transaction.cleared === "reconciled" ? {} : { cleared: transaction.cleared }),
    flag: transaction.flag,
    // Edits approve an unapproved transaction (as in YNAB), so an undo puts its approval back.
    approved: transaction.approved,
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
