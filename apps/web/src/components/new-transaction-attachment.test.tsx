import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Account } from "@/lib/accounts";
import type { TransactionDraft } from "@/lib/ai";
import type { MoneySettings } from "@/lib/money-input";
import { emptyDraft } from "@/lib/transactions";
import { registerColumns } from "./register-columns";
import { TransactionEditor } from "./transaction-editor";

const { draftTransactionFromFile } = vi.hoisted(() => ({ draftTransactionFromFile: vi.fn() }));
vi.mock("@/lib/ai", async (original) => ({
  ...(await original<typeof import("@/lib/ai")>()),
  draftTransactionFromFile,
}));

// jsdom has no object URLs; the cell makes one for the photo's thumbnail.
URL.createObjectURL = () => "blob:preview";
URL.revokeObjectURL = () => {};

const usd: MoneySettings = {
  currency: "USD",
  numberFormat: "comma_dot",
  currencySymbolPosition: "before",
  dateFormat: "MM/DD/YYYY",
};

const checking = {
  id: "checking",
  name: "Checking",
  type: "checking",
  currency: "USD",
  closed: false,
} as Account;

function renderEditor(aiEnabled: boolean) {
  const onSave = vi.fn();
  render(
    <table>
      <tbody>
        <TransactionEditor
          initial={emptyDraft("checking", "2026-10-01")}
          columns={registerColumns(false)}
          accounts={[checking]}
          payees={[]}
          categories={[
            { id: "groceries", name: "Groceries", group: "Everyday" },
            { id: "home", name: "Household", group: "Everyday" },
          ]}
          dateFormat="MM/DD/YYYY"
          settings={usd}
          flags={[]}
          onRenameFlags={async () => {}}
          pending={false}
          error={null}
          onSave={onSave}
          onCancel={() => {}}
          newAttachment={{ budgetId: "b1", aiEnabled }}
        />
      </tbody>
    </table>,
  );
  return { onSave };
}

const receipt = () => new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
const picker = () => document.querySelector<HTMLInputElement>('input[type="file"]') as HTMLElement;

const read: TransactionDraft = {
  found: true,
  date: "2026-10-17",
  payeeId: "p1",
  payeeName: "Walmart",
  categoryId: null,
  memo: "Weekly shop",
  amount: "-4217",
  lines: [
    { categoryId: "groceries", memo: "Food", amount: "-3000" },
    { categoryId: "home", memo: null, amount: "-1217" },
  ],
  note: null,
};

describe("A new transaction's receipt", () => {
  it("fills the row in with AI when asked, uncleared, and saves with the file", async () => {
    const user = userEvent.setup();
    draftTransactionFromFile.mockResolvedValue(read);
    const { onSave } = renderEditor(true);
    const file = receipt();
    await user.upload(picker(), file);

    expect(screen.getByRole("alertdialog", { name: "Fill in this transaction?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Fill in with AI" }));
    expect(draftTransactionFromFile).toHaveBeenCalledWith(
      "b1",
      file,
      "checking",
      expect.any(String),
    );
    expect(await screen.findByDisplayValue("Weekly shop")).toBeInTheDocument();
    expect(screen.getByLabelText("Payee")).toHaveValue("Walmart");

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2026-10-17",
        payeeName: "Walmart",
        outflow: "42.17",
        cleared: "uncleared",
        lines: [
          expect.objectContaining({ categoryId: "groceries", memo: "Food", outflow: "30.00" }),
          expect.objectContaining({ categoryId: "home", outflow: "12.17" }),
        ],
      }),
      file,
    );
  });

  it("opens once picked, to delete it or have the AI fill the row in after all", async () => {
    const user = userEvent.setup();
    draftTransactionFromFile.mockClear();
    draftTransactionFromFile.mockResolvedValue(read);
    const { onSave } = renderEditor(true);
    await user.upload(picker(), receipt());
    await user.click(screen.getByRole("button", { name: "Just attach it" }));

    await user.click(screen.getByRole("button", { name: "Open the attachment receipt.jpg" }));
    await user.click(screen.getByRole("button", { name: "Fill in with AI" }));
    expect(draftTransactionFromFile).toHaveBeenCalledTimes(1);
    expect(await screen.findByDisplayValue("Weekly shop")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open the attachment receipt.jpg" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Add a photo or PDF" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.anything(), null);
  });

  it("can just be attached", async () => {
    const user = userEvent.setup();
    draftTransactionFromFile.mockClear();
    const { onSave } = renderEditor(true);
    await user.upload(picker(), receipt());
    await user.click(screen.getByRole("button", { name: "Just attach it" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(draftTransactionFromFile).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith(expect.anything(), expect.any(File));
  });

  it("doesn't offer AI while it's off for the budget", async () => {
    const user = userEvent.setup();
    renderEditor(false);
    expect(screen.getByRole("button", { name: "Add a photo or PDF" })).toBeInTheDocument();
    await user.upload(picker(), receipt());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open the attachment receipt.jpg" }));
    expect(screen.getByRole("dialog", { name: "receipt.jpg" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Fill in with AI" })).not.toBeInTheDocument();
  });
});
