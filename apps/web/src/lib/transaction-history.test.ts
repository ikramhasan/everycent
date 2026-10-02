import { describe, expect, it } from "vitest";
import { createBodyFromTransaction, updateBodyFromTransaction } from "./transaction-history";
import type { Transaction } from "./transactions";

const transaction: Transaction = {
  id: "t1",
  accountId: "a1",
  accountName: "Checking",
  date: "2026-10-03",
  amount: "-1200",
  currency: "USD",
  payeeId: "p1",
  payeeName: "Shop",
  categoryId: null,
  categoryName: null,
  memo: "weekly",
  cleared: "cleared",
  flag: "blue",
  transferAccountId: null,
  transferTransactionId: null,
  transferFromSplit: false,
  subtransactions: [
    {
      id: "s1",
      amount: "-700",
      payeeId: null,
      payeeName: null,
      categoryId: "c1",
      categoryName: "Food",
      memo: "food",
      transferAccountId: null,
      transferTransactionId: null,
    },
    {
      id: "s2",
      amount: "-500",
      payeeId: null,
      payeeName: null,
      categoryId: null,
      categoryName: null,
      memo: "transfer",
      transferAccountId: "a2",
      transferTransactionId: "t2",
    },
  ],
  runningBalance: "10000",
  matchingLineIds: null,
};

describe("transaction history bodies", () => {
  it("recreates a deleted split without reusing its database line ids", () => {
    expect(createBodyFromTransaction(transaction).subtransactions).toEqual([
      { amount: "-700", payeeName: null, categoryId: "c1", memo: "food" },
      {
        amount: "-500",
        payeeName: null,
        transferAccountId: "a2",
        categoryId: null,
        memo: "transfer",
      },
    ]);
  });

  it("restores an edited split by matching its existing line ids", () => {
    expect(updateBodyFromTransaction(transaction).subtransactions?.map((line) => line.id)).toEqual([
      "s1",
      "s2",
    ]);
  });
});
