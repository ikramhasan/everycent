import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Account } from "@/lib/accounts";
import type { MoneySettings } from "@/lib/money-input";
import { emptyDraft } from "@/lib/transactions";
import { registerColumns } from "./register-columns";
import { TransactionEditor } from "./transaction-editor";

const usd: MoneySettings = {
  currency: "USD",
  numberFormat: "comma_dot",
  currencySymbolPosition: "before",
  dateFormat: "MM/DD/YYYY",
};

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
  const onRenameFlags = vi.fn(async () => {});
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
          settings={usd}
          flags={[
            { color: "red", name: "Reimbursable" },
            { color: "blue", name: "" },
          ]}
          onRenameFlags={onRenameFlags}
          pending={false}
          error={null}
          onSave={onSave}
          onCancel={onCancel}
        />
      </tbody>
    </table>,
  );
  return { onSave, onCancel, onRenameFlags };
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

  it("splits across categories, with a remaining counter", async () => {
    const { onSave } = renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Outflow"), "120");
    await user.click(screen.getByLabelText("Category"));
    await user.click(screen.getByRole("option", { name: "Split" }));
    expect(screen.getByText("Split (2 lines)")).toBeInTheDocument();
    expect(screen.getByText("120.00 left to split")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Outflow, line 1"), "80");
    await user.type(screen.getByLabelText("Outflow, line 2"), "40");
    expect(screen.getByText("Fully split")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.click(screen.getByRole("button", { name: "Remove line 3" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        outflow: "120",
        lines: [
          expect.objectContaining({ outflow: "80" }),
          expect.objectContaining({ outflow: "40" }),
        ],
      }),
    );
  });

  it("doesn't offer a split on a transfer", async () => {
    renderEditor();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Category"));
    expect(screen.getByRole("option", { name: "Split" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.type(screen.getByLabelText("Payee"), "brokerage");
    await user.keyboard("{Enter}");
    await user.click(screen.getByLabelText("Category"));
    expect(screen.queryByRole("option", { name: "Split" })).not.toBeInTheDocument();
  });

  it("flags a new transaction and renames flags", async () => {
    const { onSave, onRenameFlags } = renderEditor();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add flag" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Reimbursable (Red)" }));
    expect(screen.getByRole("button", { name: "Flag: Reimbursable (Red)" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Flag: Reimbursable (Red)" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit names" }));
    await user.type(screen.getByLabelText("Name for Blue"), "Tax");
    await user.click(screen.getByRole("button", { name: "Save names" }));
    expect(onRenameFlags).toHaveBeenCalledWith([{ color: "blue", name: "Tax" }]);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ flag: "red" }));
  });
});
