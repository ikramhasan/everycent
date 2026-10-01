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
  runningBalance: "0",
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
            },
            {
              id: "old",
              groupId: "bills",
              name: "Old",
              note: "",
              hidden: true,
              linkedAccountId: null,
              hasTransactions: false,
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
