import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MoneySettings } from "@/lib/money-input";
import type { CellColumn, Payee, Transaction } from "@/lib/transactions";
import { CellEditor } from "./cell-editor";

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
  amount: "-2500",
  currency: "USD",
  payeeId: null,
  payeeName: "Market",
  categoryId: null,
  categoryName: null,
  memo: "",
  cleared: "uncleared",
  transferAccountId: null,
  transferTransactionId: null,
  transferFromSplit: false,
  subtransactions: [],
  runningBalance: "0",
};

function renderCell(column: CellColumn, transaction = txn, payees: Payee[] = []) {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  render(
    <CellEditor
      transaction={transaction}
      column={column}
      settings={usd}
      dateFormat="MM/DD/YYYY"
      accounts={[]}
      payees={payees}
      transfers={[{ id: "savings", name: "Savings" }]}
      categories={[{ id: "rent", name: "Rent", group: "Bills" }]}
      onCommit={onCommit}
      onCancel={onCancel}
    />,
  );
  return { onCommit, onCancel };
}

describe("CellEditor", () => {
  it("starts with the cell's value selected and saves on Enter", async () => {
    const { onCommit } = renderCell("outflow");
    const user = userEvent.setup();
    expect(screen.getByLabelText("Outflow")).toHaveValue("25.00");
    await user.keyboard("230+30{Enter}");
    expect(onCommit).toHaveBeenCalledWith("230+30", "stay", null);
  });

  it("saves and moves on with Tab, backwards with Shift+Tab", async () => {
    const { onCommit } = renderCell("memo");
    const user = userEvent.setup();
    await user.keyboard("weekly{Tab}");
    expect(onCommit).toHaveBeenCalledWith("weekly", "next", null);
  });

  it("cancels on Esc without saving", async () => {
    const { onCommit, onCancel } = renderCell("memo");
    await userEvent.setup().keyboard("x{Escape}");
    expect(onCancel).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("saves a category as soon as one is picked", async () => {
    const { onCommit } = renderCell("category");
    const user = userEvent.setup();
    await user.keyboard("ren");
    await user.click(await screen.findByRole("option", { name: "Rent" }));
    expect(onCommit).toHaveBeenCalledWith("rent", "stay", null);
  });

  it("picks a transfer from the payee list", async () => {
    const { onCommit } = renderCell("payee");
    const user = userEvent.setup();
    await user.keyboard("{Control>}a{/Control}sav");
    expect(screen.getByText("Transfers")).toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "Savings" }));
    expect(onCommit).toHaveBeenCalledWith("Transfer : Savings", "stay", "savings");
  });

  it("keeps a transfer a transfer when its payee is left as is", async () => {
    const transfer = { ...txn, payeeName: "Transfer : Savings", transferAccountId: "savings" };
    const { onCommit } = renderCell("payee", transfer);
    await userEvent.setup().keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledWith("Transfer : Savings", "stay", "savings");
  });

  it("opens the whole payee list, as YNAB does, and narrows it once you type", async () => {
    const payees = [
      { id: "p1", name: "Market", lastCategoryId: null },
      { id: "p2", name: "Bakery", lastCategoryId: null },
    ];
    const { onCommit } = renderCell("payee", txn, payees);
    const user = userEvent.setup();
    const options = () => screen.getAllByRole("option").map((o) => o.textContent);
    expect(options()).toEqual(["Market", "Bakery", "Savings"]);
    // The current payee is selected, so typing replaces it.
    await user.keyboard("bak");
    expect(options()).toEqual(["Bakery", " Create payee “bak”"]);
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledWith("Bakery", "stay", null);
  });

  it("keeps the payee when Enter is pressed without picking", async () => {
    const payees = [{ id: "p2", name: "Bakery", lastCategoryId: null }];
    const { onCommit } = renderCell("payee", txn, payees);
    await userEvent.setup().keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledWith("Market", "stay", null);
  });
});
