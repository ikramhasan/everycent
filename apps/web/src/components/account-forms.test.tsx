import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MoneySettings } from "@/lib/money-input";
import { AddAccountForm, EditAccountForm } from "./account-forms";

const usd: MoneySettings = {
  currency: "USD",
  numberFormat: "comma_dot",
  currencySymbolPosition: "before",
  dateFormat: "MM/DD/YYYY",
};

describe("AddAccountForm", () => {
  it("records a cash balance as-is, in minor units", async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<AddAccountForm settings={usd} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Nickname"), "Checking");
    await userEvent.type(screen.getByLabelText("What's the balance today?"), "1,234.56");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Checking",
      type: "checking",
      balance: "123456",
    });
  });

  it("asks debt accounts for the amount owed and stores it as negative", async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<AddAccountForm settings={usd} onSubmit={onSubmit} />);
    await userEvent.selectOptions(screen.getByLabelText("Account type"), "credit_card");
    await userEvent.type(screen.getByLabelText("Nickname"), "Visa");
    await userEvent.type(screen.getByLabelText("How much do you owe today?"), "375");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Visa", type: "credit_card", balance: "-37500" });
  });

  it("collects loan details for loan accounts", async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<AddAccountForm settings={usd} onSubmit={onSubmit} />);
    await userEvent.selectOptions(screen.getByLabelText("Account type"), "mortgage");
    await userEvent.type(screen.getByLabelText("Nickname"), "Home");
    await userEvent.type(screen.getByLabelText("How much do you owe today?"), "250000");
    await userEvent.type(screen.getByLabelText("Interest rate (%)"), "6.125");
    await userEvent.type(screen.getByLabelText("Minimum payment"), "1,800");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Home",
      type: "mortgage",
      balance: "-25000000",
      interestRate: "6.125",
      minimumPayment: "180000",
      escrowAmount: undefined,
    });
  });

  it("reads amounts in the budget's number format", async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(
      <AddAccountForm
        settings={{ ...usd, currency: "EUR", numberFormat: "dot_comma" }}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText("Nickname"), "Girokonto");
    await userEvent.type(screen.getByLabelText("What's the balance today?"), "1.234,5");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ balance: "123450" }));
  });

  it("explains an amount it can't read", async () => {
    const onSubmit = vi.fn();
    render(<AddAccountForm settings={usd} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Nickname"), "Checking");
    await userEvent.type(screen.getByLabelText("What's the balance today?"), "12.345");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter an amount like 1,234.56");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("EditAccountForm", () => {
  it("only offers types from the same family", () => {
    render(
      <EditAccountForm
        settings={usd}
        initial={{
          name: "Visa",
          note: "",
          type: "credit_card",
          interestRate: null,
          minimumPayment: null,
          escrowAmount: null,
        }}
        onSubmit={vi.fn()}
      />,
    );
    const options = within(screen.getByLabelText("Account type"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["Credit Card", "Line of Credit"]);
  });
});
