import { describe, expect, it } from "vitest";
import type { CategoryList } from "./categories";
import type { MoneySettings } from "./money-input";
import {
  categoryOptions,
  cellUpdate,
  createBody,
  type Draft,
  draftFrom,
  emptyDraft,
  emptyLine,
  splitRemaining,
  startSplit,
  type Transaction,
  updateBody,
} from "./transactions";

const usd: MoneySettings = {
  currency: "USD",
  numberFormat: "comma_dot",
  currencySymbolPosition: "before",
  dateFormat: "MM/DD/YYYY",
};

const txn: Transaction = {
  id: "t1",
  accountId: "a1",
  accountName: "Checking",
  date: "2026-10-01",
  amount: "-123456",
  currency: "USD",
  payeeId: "p1",
  payeeName: "Market",
  categoryId: null,
  categoryName: null,
  memo: "",
  cleared: "reconciled",
  transferAccountId: null,
  transferTransactionId: null,
  flag: null,
  approved: true,
  transferFromSplit: false,
  transferReconciled: false,
  subtransactions: [],
  runningBalance: "0",
  matchingLineIds: null,
};

describe("register drafts", () => {
  it("turns outflow and inflow fields into a signed amount", () => {
    const draft: Draft = { ...emptyDraft("a1", "2026-10-01"), outflow: "1,234.56" };
    expect(createBody(draft, usd)).toEqual({
      ok: true,
      body: {
        accountId: "a1",
        date: "2026-10-01",
        amount: "-123456",
        payeeName: null,
        categoryId: null,
        memo: "",
        cleared: "uncleared",
        flag: null,
      },
    });
    const income = createBody({ ...draft, outflow: "", inflow: "50", payeeName: " Job " }, usd);
    expect(income).toMatchObject({ ok: true, body: { amount: "5000", payeeName: "Job" } });
  });

  it("asks for a transfer by account instead of a payee name", () => {
    const draft: Draft = {
      ...emptyDraft("a1", "2026-10-01"),
      outflow: "5",
      payeeName: "Transfer : Savings",
      transferAccountId: "a2",
    };
    expect(createBody(draft, usd)).toMatchObject({
      ok: true,
      body: { payeeName: null, transferAccountId: "a2" },
    });
  });

  it("explains an amount it can't read", () => {
    const draft = { ...emptyDraft("a1", "2026-10-01"), outflow: "12.345" };
    expect(createBody(draft, usd)).toEqual({ ok: false, error: "Enter an amount like 1,234.56" });
  });

  it("sends only the fields that changed", () => {
    const draft = draftFrom(txn, usd);
    expect(draft).toMatchObject({ outflow: "1,234.56", inflow: "", cleared: "cleared" });
    // Untouched: nothing to send, so a reconciled transaction stays reconciled and an
    // uncategorized starting balance stays uncategorized.
    expect(updateBody(txn, draft, usd)).toEqual({ ok: true, body: {} });
    expect(updateBody(txn, { ...draft, memo: "weekly", outflow: "20" }, usd)).toEqual({
      ok: true,
      body: { memo: "weekly", amount: "-2000" },
    });
  });

  it("offers Ready to Assign and visible categories, never payment categories", () => {
    const list: CategoryList = {
      readyToAssignCategoryId: "rta",
      groups: [
        {
          id: "cc",
          name: "Credit Card Payments",
          hidden: false,
          kind: "credit_card_payments",
          categories: [
            {
              id: "visa",
              groupId: "cc",
              name: "Visa",
              note: "",
              hidden: false,
              linkedAccountId: "a2",
              hasTransactions: false,
              transactionCount: 0,
              hasAssignedMoney: false,
              target: null,
            },
          ],
        },
        {
          id: "bills",
          name: "Bills",
          hidden: false,
          kind: null,
          categories: [
            {
              id: "rent",
              groupId: "bills",
              name: "Rent",
              note: "",
              hidden: false,
              linkedAccountId: null,
              hasTransactions: false,
              transactionCount: 0,
              hasAssignedMoney: false,
              target: null,
            },
            {
              id: "old",
              groupId: "bills",
              name: "Old",
              note: "",
              hidden: true,
              linkedAccountId: null,
              hasTransactions: false,
              transactionCount: 0,
              hasAssignedMoney: false,
              target: null,
            },
          ],
        },
      ],
    };
    expect(categoryOptions(list)).toEqual([
      { id: "rta", name: "Ready to Assign", group: "Inflow" },
      { id: "rent", name: "Rent", group: "Bills" },
    ]);
  });
});

describe("cellUpdate", () => {
  it("turns an edited amount cell into the transaction's new amount", () => {
    expect(cellUpdate(txn, "outflow", "230+30", usd)).toEqual({
      ok: true,
      body: { amount: "-26000" },
    });
    // Typing an inflow on an outflow flips it.
    expect(cellUpdate(txn, "inflow", "5", usd)).toEqual({ ok: true, body: { amount: "500" } });
    // Emptying the outflow of an outflow makes it zero; emptying the other side changes nothing.
    expect(cellUpdate(txn, "outflow", "", usd)).toEqual({ ok: true, body: { amount: "0" } });
    expect(cellUpdate(txn, "inflow", "", usd)).toEqual({ ok: true, body: {} });
    expect(cellUpdate(txn, "outflow", "1,234.56", usd)).toEqual({ ok: true, body: {} });
    expect(cellUpdate(txn, "outflow", "abc", usd)).toMatchObject({ ok: false });
  });

  it("sends only a changed field", () => {
    expect(cellUpdate(txn, "memo", "", usd)).toEqual({ ok: true, body: {} });
    expect(cellUpdate(txn, "memo", "milk", usd)).toEqual({ ok: true, body: { memo: "milk" } });
    expect(cellUpdate(txn, "payee", " ", usd)).toEqual({ ok: true, body: { payeeName: null } });
    expect(cellUpdate(txn, "date", "2026-10-02", usd)).toEqual({
      ok: true,
      body: { date: "2026-10-02" },
    });
  });

  it("switches between payees and transfers", () => {
    const transfer = { ...txn, payeeName: "Transfer : Savings", transferAccountId: "a2" };
    expect(cellUpdate(txn, "payee", "Transfer : Savings", usd, "a2")).toEqual({
      ok: true,
      body: { transferAccountId: "a2" },
    });
    expect(cellUpdate(transfer, "payee", "Transfer : Savings", usd, "a2")).toEqual({
      ok: true,
      body: {},
    });
    // Same text, but no longer the transfer: it becomes a normal payee.
    expect(cellUpdate(transfer, "payee", "Transfer : Savings", usd)).toEqual({
      ok: true,
      body: { payeeName: "Transfer : Savings" },
    });
    expect(cellUpdate(transfer, "payee", "Bank", usd)).toEqual({
      ok: true,
      body: { payeeName: "Bank" },
    });
  });
});

describe("splits", () => {
  const receipt: Draft = {
    ...emptyDraft("a1", "2026-10-01"),
    payeeName: "Supermarket",
    outflow: "120",
    lines: [
      emptyLine({ categoryId: "groceries", outflow: "80", memo: "food" }),
      emptyLine({ categoryId: "household", outflow: "40" }),
    ],
  };

  it("moves the category to the first line when splitting", () => {
    const split = startSplit({ ...emptyDraft("a1", "2026-10-01"), categoryId: "groceries" });
    expect(split.categoryId).toBeNull();
    expect(split.lines?.map((l) => l.categoryId)).toEqual(["groceries", null]);
  });

  it("counts what's left to split, for outflows and inflows", () => {
    const short = { ...receipt, outflow: "130" };
    expect(splitRemaining(short, usd)).toEqual({ total: -13000n, remaining: 1000n });
    expect(splitRemaining({ ...receipt, outflow: "100" }, usd)).toMatchObject({
      remaining: -2000n,
    });
    // No total typed: the lines make it up.
    expect(splitRemaining({ ...receipt, outflow: "" }, usd)).toEqual({
      total: -12000n,
      remaining: 0n,
    });
    expect(createBody(short, usd)).toEqual({
      ok: false,
      error: "The lines must add up to the total: 10.00 left to split.",
    });
  });

  it("sends the lines, with transfers by account", () => {
    const lines = receipt.lines ?? [];
    const draft: Draft = {
      ...receipt,
      lines: [
        ...lines.slice(0, 1),
        { ...(lines[1] ?? emptyLine()), categoryId: null, transferAccountId: "a2", payeeName: "x" },
      ],
    };
    expect(createBody(draft, usd)).toMatchObject({
      ok: true,
      body: {
        amount: "-12000",
        categoryId: null,
        subtransactions: [
          { amount: "-8000", payeeName: null, categoryId: "groceries", memo: "food" },
          { amount: "-4000", payeeName: null, transferAccountId: "a2", categoryId: null },
        ],
      },
    });
  });

  it("isn't a split any more with one line left: it keeps that line's category", () => {
    const one = { ...receipt, outflow: "", lines: receipt.lines?.slice(1) ?? [] };
    const result = createBody(one, usd);
    expect(result).toMatchObject({ ok: true, body: { amount: "-4000", categoryId: "household" } });
    expect(result.ok && "subtransactions" in result.body).toBe(false);
  });

  it("only sends changed lines, and un-splits with a category", () => {
    const split: Transaction = {
      ...txn,
      amount: "-12000",
      cleared: "uncleared",
      subtransactions: [
        {
          id: "l1",
          amount: "-8000",
          payeeId: null,
          payeeName: null,
          categoryId: "groceries",
          categoryName: "Groceries",
          memo: "",
          transferAccountId: null,
          transferTransactionId: null,
          transferReconciled: false,
        },
        {
          id: "l2",
          amount: "-4000",
          payeeId: null,
          payeeName: null,
          categoryId: "household",
          categoryName: "Household",
          memo: "",
          transferAccountId: null,
          transferTransactionId: null,
          transferReconciled: false,
        },
      ],
    };
    const draft = draftFrom(split, usd);
    expect(updateBody(split, draft, usd)).toEqual({ ok: true, body: {} });

    const lines = draft.lines ?? [];
    const edited = { ...draft, lines: lines.map((l, i) => (i === 0 ? { ...l, memo: "food" } : l)) };
    expect(updateBody(split, edited, usd)).toMatchObject({
      ok: true,
      body: { subtransactions: [{ id: "l1", memo: "food" }, { id: "l2" }] },
    });

    const unsplit = { ...draft, lines: lines.slice(0, 1), outflow: "120" };
    expect(updateBody(split, unsplit, usd)).toEqual({
      ok: true,
      body: { categoryId: "groceries" },
    });
  });
});
