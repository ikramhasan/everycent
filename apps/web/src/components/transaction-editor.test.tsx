import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Account } from "@/lib/accounts";
import { emptyDraft } from "@/lib/transactions";
import { registerColumns } from "./register-columns";
import { TransactionEditor } from "./transaction-editor";

const account = (id: string, type: Account["type"]): Account => ({
  id,
  name: id,
  type,
  note: "",
  closed: false,
  currency: "USD",
  interestRate: null,
  minimumPayment: null,
  escrowAmount: null,
  paymentCategoryId: null,
  balances: { cleared: "0", uncleared: "0", working: "0" },
});

function renderEditor(accountId = "checking") {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <table>
      <tbody>
        <TransactionEditor
          initial={emptyDraft(accountId, "2026-10-01")}
          columns={registerColumns(false)}
          accounts={[
            account("checking", "checking"),
            account("savings", "savings"),
            account("brokerage", "asset"),
          ]}
          payees={[{ id: "p1", name: "Market", lastCategoryId: "groceries" }]}
          categories={[
            { id: "rta", name: "Ready to Assign", group: "Inflow" },
            { id: "groceries", name: "Groceries", group: "Everyday" },
            { id: "rent", name: "Rent", group: "Bills" },
          ]}
          dateFormat="MM/DD/YYYY"
          pending={false}
          error={null}
          onSave={onSave}
          onCancel={onCancel}
        />
      </tbody>
    </table>,
  );
  return { onSave, onCancel };
}

describe("TransactionEditor", () => {
  it("fills in a known payee's last category and saves on Enter", async () => {
    const { onSave } = renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Payee"), "mar");
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Payee")).toHaveValue("Market");
    expect(screen.getByLabelText("Category")).toHaveValue("Groceries");
    expect(onSave).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Outflow"), "12.50{Enter}");
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        payeeName: "Market",
        categoryId: "groceries",
        outflow: "12.50",
        inflow: "",
      }),
    );
  });

  it("creates a new payee from typed text", async () => {
    const { onSave } = renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Payee"), "Bakery");
    expect(screen.getByRole("option", { name: /Create payee “Bakery”/ })).toBeInTheDocument();
    await user.keyboard("{Enter}{Enter}");
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ payeeName: "Bakery" }));
  });

  it("closes an open list on Esc before cancelling the row", async () => {
    const { onCancel } = renderEditor();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Category"));
    expect(screen.getByRole("option", { name: "Rent" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option", { name: "Rent" })).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });

  it("clears the other amount field when one is typed", async () => {
    renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Outflow"), "5");
    await user.type(screen.getByLabelText("Inflow"), "7");
    expect(screen.getByLabelText("Outflow")).toHaveValue("");
    expect(screen.getByLabelText("Inflow")).toHaveValue("7");
  });

  it("doesn't ask tracking accounts for a category", () => {
    renderEditor("brokerage");
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
    expect(screen.getByText("Category not needed")).toBeInTheDocument();
  });

  it("drops the category for a transfer within the budget, keeps it for one leaving it", async () => {
    const { onSave } = renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Payee"), "savings");
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Payee")).toHaveValue("Transfer : savings");
    expect(screen.getByText("Category not needed")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Payee"));
    await user.type(screen.getByLabelText("Payee"), "brokerage");
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Outflow"), "10{Enter}");
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        transferAccountId: "brokerage",
        payeeName: "Transfer : brokerage",
      }),
    );
  });

  it("doesn't offer the account itself as a transfer", async () => {
    renderEditor();
    await userEvent.setup().click(screen.getByLabelText("Payee"));
    expect(screen.queryByRole("option", { name: "checking" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "savings" })).toBeInTheDocument();
  });
});
