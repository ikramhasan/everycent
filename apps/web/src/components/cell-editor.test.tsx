import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MoneySettings } from "@/lib/money-input";
import type { CellColumn, Transaction } from "@/lib/transactions";
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
  runningBalance: "0",
};

function renderCell(column: CellColumn) {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  render(
    <CellEditor
      transaction={txn}
      column={column}
      settings={usd}
      dateFormat="MM/DD/YYYY"
      accounts={[]}
      payees={[]}
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
    expect(onCommit).toHaveBeenCalledWith("230+30", "stay");
  });

  it("saves and moves on with Tab, backwards with Shift+Tab", async () => {
    const { onCommit } = renderCell("memo");
    const user = userEvent.setup();
    await user.keyboard("weekly{Tab}");
    expect(onCommit).toHaveBeenCalledWith("weekly", "next");
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
    expect(onCommit).toHaveBeenCalledWith("rent", "stay");
  });
});
