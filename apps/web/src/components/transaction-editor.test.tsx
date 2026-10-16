import { render, screen, within } from "@testing-library/react";
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
  starredOrder: null,
  currency: "USD",
  interestRate: null,
  minimumPayment: null,
  escrowAmount: null,
  paymentCategoryId: null,
  hasHistory: false,
  lastReconciledAt: null,
  pairedCategoryId: null,
  lastPaymentDate: null,
  lastPaymentFromAccountId: null,
  migratedToAccountId: null,
  migratedFromAccountId: null,
  toReview: 0,
  unrealizedGain: null,
  rate: null,
  rateDate: null,
  balances: { cleared: "0", uncleared: "0", working: "0" },
});

function renderEditor(accountId = "checking", { another = false } = {}) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const onSaveAndAddAnother = vi.fn();
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
            account("visa", "credit_card"),
          ]}
          payees={[
            {
              id: "p1",
              name: "Market",
              hidden: false,
              useCount: 3,
              categorization: "auto",
              defaultCategoryId: null,
              autoCategoryId: "groceries",
              prefillCategoryId: "groceries",
              recentCategoryIds: ["rent", "groceries", "gone"],
            },
          ]}
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
          transferCategory={(from, to) =>
            [from, to].includes("visa") && [from, to].includes("checking")
              ? "Credit Card Payments: visa"
              : ""
          }
          onSave={onSave}
          onSaveAndAddAnother={another ? onSaveAndAddAnother : undefined}
          onCancel={onCancel}
        />
      </tbody>
    </table>,
  );
  return { onSave, onCancel, onRenameFlags, onSaveAndAddAnother };
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

  it("lists the selected category and the payee's other recent ones first (YNAB)", async () => {
    renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Payee"), "Market");
    await user.keyboard("{Enter}");
    await user.click(screen.getByLabelText("Category"));
    const groups = within(screen.getByRole("listbox")).getAllByRole("group");
    expect(groups[0]).toHaveTextContent(/^Selected\s*Groceries \(Everyday\)$/);
    // Rent only: Groceries is selected, and categories no longer listed are skipped.
    expect(groups[1]).toHaveTextContent(/^Suggested\s*Rent \(Bills\)$/);
    expect(groups[2]).toHaveTextContent(/^Inflow/);

    // Picking a suggestion files it under the real category.
    await user.click(screen.getByRole("option", { name: "Rent (Bills)" }));
    expect(screen.getByLabelText("Category")).toHaveValue("Rent");

    // Typing shows the matches only.
    await user.clear(screen.getByLabelText("Category"));
    await user.type(screen.getByLabelText("Category"), "Gro");
    expect(screen.queryByText("Suggested")).not.toBeInTheDocument();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Groceries"]);
  });

  it("offers Save and add another on a new row, and Enter does it (YNAB)", async () => {
    const { onSave, onSaveAndAddAnother } = renderEditor("checking", { another: true });
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Save and add another" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Outflow"), "5{Enter}");
    expect(onSaveAndAddAnother).toHaveBeenCalledWith(expect.objectContaining({ outflow: "5" }));
    await user.click(screen.getByRole("button", { name: "Save and add another" }));
    expect(onSaveAndAddAnother).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("starts cleared in a cash account, and re-applies it when a new row's account changes", async () => {
    const user = userEvent.setup();
    const onSaveAndAddAnother = vi.fn();
    render(
      <table>
        <tbody>
          <TransactionEditor
            initial={emptyDraft("wallet", "2026-10-01", "cash")}
            columns={registerColumns(true)}
            accounts={[account("wallet", "cash"), account("checking", "checking")]}
            payees={[]}
            categories={[]}
            dateFormat="MM/DD/YYYY"
            settings={usd}
            flags={[]}
            onRenameFlags={vi.fn(async () => {})}
            pending={false}
            error={null}
            onSave={vi.fn()}
            onSaveAndAddAnother={onSaveAndAddAnother}
            onCancel={vi.fn()}
          />
        </tbody>
      </table>,
    );
    // YNAB, 2026-10-15 (EVERYCENT-146).
    expect(screen.getByRole("button", { name: "Cleared" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Account"), "checking");
    expect(screen.getByRole("button", { name: "Uncleared" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Uncleared" }));
    await user.selectOptions(screen.getByLabelText("Account"), "wallet");
    await user.selectOptions(screen.getByLabelText("Account"), "checking");
    expect(screen.getByRole("button", { name: "Uncleared" })).toBeInTheDocument();
  });

  it("has no Save and add another when editing", () => {
    renderEditor();
    expect(screen.queryByRole("button", { name: "Save and add another" })).not.toBeInTheDocument();
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
    // No amount yet, so YNAB's "To/From" wording (2026-10-15).
    expect(screen.getByLabelText("Payee")).toHaveValue("To/From savings");
    expect(screen.getByText("Category not needed")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Payee"));
    await user.type(screen.getByLabelText("Payee"), "brokerage");
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Outflow"), "10{Enter}");
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        transferAccountId: "brokerage",
        payeeName: "To/From brokerage",
      }),
    );
  });

  it("doesn't offer the account itself as a transfer", async () => {
    renderEditor();
    await userEvent.setup().click(screen.getByLabelText("Payee"));
    expect(screen.queryByRole("option", { name: "To/From checking" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "To/From savings" })).toBeInTheDocument();
  });

  it("shows a card payment's category and offers the card's Payment to (YNAB, 2026-10-15)", async () => {
    renderEditor("visa");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Inflow"), "5");
    await user.click(screen.getByLabelText("Payee"));
    expect(screen.getByRole("option", { name: "Payment from checking" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Payment from brokerage" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Payment from checking" }));
    expect(screen.getByText("Credit Card Payments: visa")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Payee"));
    await user.type(screen.getByLabelText("Payee"), "Market{Enter}");
    await user.click(screen.getByLabelText("Category"));
    await user.click(screen.getByRole("option", { name: "Payment to visa" }));
    expect(screen.getByLabelText("Payee")).toHaveValue("");
    expect(screen.getByLabelText("Payee")).toHaveFocus();
    expect(screen.getByLabelText("Category")).toHaveValue("");
  });

  it("words transfers by the amount's direction (YNAB, 2026-10-15)", async () => {
    renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Outflow"), "5");
    await user.click(screen.getByLabelText("Payee"));
    expect(screen.getByText("Payments and Transfers")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Transfer to savings" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Transfer to savings" }));
    expect(screen.getByLabelText("Payee")).toHaveValue("Transfer to savings");
  });

  it("lists transfers first until something is typed (YNAB, 2026-10-16)", async () => {
    renderEditor();
    const user = userEvent.setup();
    const headings = () =>
      screen
        .getAllByText(/^(Saved Payees|Payments and Transfers)$/)
        .map((element) => element.textContent);
    await user.click(screen.getByLabelText("Payee"));
    expect(headings()).toEqual(["Payments and Transfers", "Saved Payees"]);
    await user.type(screen.getByLabelText("Payee"), "a");
    expect(headings()).toEqual(["Saved Payees", "Payments and Transfers"]);
  });

  it("offers Payment/Transfer in the category list, back to the payee list (YNAB, 2026-10-16)", async () => {
    renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Payee"), "Market{Enter}");
    expect(screen.getByLabelText("Category")).toHaveValue("Groceries");
    await user.click(screen.getByLabelText("Category"));
    await user.click(screen.getByRole("option", { name: "Payment/Transfer" }));
    // The payee and category stay; the payee list opens to pick an account.
    expect(screen.getByLabelText("Payee")).toHaveFocus();
    expect(screen.getByLabelText("Payee")).toHaveValue("Market");
    expect(screen.getByLabelText("Category")).toHaveValue("Groceries");
    expect(screen.getByRole("option", { name: "To/From savings" })).toBeInTheDocument();
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

  it("asks what to do with a split that doesn't add up, as YNAB does", async () => {
    const { onSave, onCancel } = renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Outflow"), "10");
    await user.click(screen.getByLabelText("Category"));
    await user.click(screen.getByRole("option", { name: "Split" }));
    await user.type(screen.getByLabelText("Outflow, line 1"), "3");
    await user.type(screen.getByLabelText("Outflow, line 2"), "4");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    const prompt = await screen.findByRole("alertdialog");
    expect(prompt).toHaveTextContent("Something Doesn't Add Up");
    expect(prompt).toHaveTextContent(
      "The total is -$10.00, but the splits add up to -$7.00. How would you like to handle " +
        "the unassigned -$3.00?",
    );
    // Esc closes the prompt, not the row.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();

    // Auto-Distribute: 3 and 4 share the $3 (YNAB: 4.29 and 5.71); the row stays open.
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Auto-Distribute" }));
    expect(screen.getByLabelText("Outflow, line 1")).toHaveValue("4.29");
    expect(screen.getByLabelText("Outflow, line 2")).toHaveValue("5.71");
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("updates the split's total to its lines' sum, or leaves it to be fixed by hand", async () => {
    const { onSave } = renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Outflow"), "10");
    await user.click(screen.getByLabelText("Category"));
    await user.click(screen.getByRole("option", { name: "Split" }));
    await user.type(screen.getByLabelText("Outflow, line 1"), "3");
    await user.type(screen.getByLabelText("Outflow, line 2"), "4");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Adjust Manually" }));
    expect(screen.getByLabelText("Outflow")).toHaveValue("10");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Update Total" }));
    expect(screen.getByLabelText("Outflow")).toHaveValue("7.00");
    expect(onSave).not.toHaveBeenCalled();
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
