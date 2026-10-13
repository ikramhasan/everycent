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
  approved: true,
  transferAccountId: null,
  transferTransactionId: null,
  transferFromSplit: false,
  transferReconciled: false,
  transferSide: null,
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
      transferReconciled: false,
      transferSide: null,
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
      transferReconciled: false,
      transferSide: null,
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

  it("brings a transfer's other side back as it was, even to an account closed since", () => {
    const side = {
      memo: "their memo",
      cleared: "reconciled" as const,
      flag: "red" as const,
      approved: true,
      categoryId: "c9",
    };
    const transfer = {
      ...transaction,
      payeeName: "Transfer : Savings",
      transferAccountId: "a2",
      transferTransactionId: "t2",
      approved: false,
      transferSide: side,
      subtransactions: [],
    };
    expect(createBodyFromTransaction(transfer)).toMatchObject({
      transferAccountId: "a2",
      payeeName: null,
      approved: false,
      transferSide: side,
      restore: true,
    });
    // A split's transfer lines keep their other sides' state too.
    const lines = transaction.subtransactions.map((line) =>
      line.transferAccountId ? { ...line, transferSide: side } : line,
    );
    expect(
      createBodyFromTransaction({ ...transaction, subtransactions: lines }).subtransactions?.[1],
    ).toMatchObject({ transferAccountId: "a2", transferSide: side });
    expect(createBodyFromTransaction(transaction)).not.toHaveProperty("transferSide");
  });

  it("keeps a reconciled transaction reconciled", () => {
    const reconciled = { ...transaction, cleared: "reconciled" as const };
    expect(createBodyFromTransaction(reconciled).cleared).toBe("reconciled");
    expect(updateBodyFromTransaction(reconciled)).not.toHaveProperty("cleared");
    expect(updateBodyFromTransaction(transaction).cleared).toBe("cleared");
  });
});
