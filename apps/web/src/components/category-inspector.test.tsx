import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryInspector, MonthSummary } from "./category-inspector";

const format = (a: string) => `A${a}`;

describe("CategoryInspector", () => {
  it("breaks down a category's Available and saves its note on blur", async () => {
    const user = userEvent.setup();
    const onNoteChange = vi.fn().mockResolvedValue(undefined);
    render(
      <CategoryInspector
        name="Power"
        totals={{
          carried: 500n,
          assigned: 1000n,
          activity: -4000n,
          cashActivity: -1000n,
          creditActivity: -3000n,
          available: -2500n,
        }}
        format={format}
        available={<span>pill</span>}
        note=""
        onNoteChange={onNoteChange}
      />,
    );
    expect(screen.getByRole("heading", { name: "Power" })).toBeInTheDocument();
    for (const [label, amount] of [
      ["Cash Left Over From Last Month", "A500"],
      ["Assigned This Month", "A1000"],
      ["Cash Spending", "A-1000"],
      ["Credit Spending", "A-3000"],
    ]) {
      expect(screen.getByText(label as string).nextSibling).toHaveTextContent(amount as string);
    }
    expect(screen.getByText(/You've overspent this category by A2500/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Notes"), "Quarterly");
    expect(onNoteChange).not.toHaveBeenCalled();
    await user.tab();
    expect(onNoteChange).toHaveBeenCalledWith("Quarterly");
  });

  it("shows dashes and no note for Uncategorized", () => {
    render(
      <CategoryInspector
        name="Uncategorized Transactions"
        uncategorized
        totals={{
          carried: 0n,
          assigned: 0n,
          activity: -300n,
          cashActivity: -200n,
          creditActivity: -100n,
          available: -300n,
        }}
        format={format}
        available={null}
        note=""
        onNoteChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Assigned This Month").nextSibling).toHaveTextContent("–");
    expect(screen.getByText("Credit Spending").nextSibling).toHaveTextContent("A-100");
    // Until credit overspending (phase 7c), all of it comes out of next month's Ready to Assign.
    expect(screen.getByText(/A300 will be deducted/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
  });
});

describe("MonthSummary", () => {
  it("lists what's selected", () => {
    render(
      <MonthSummary
        month="2026-10"
        totals={{
          carried: 0n,
          assigned: 0n,
          activity: -3000n,
          cashActivity: -3000n,
          creditActivity: 0n,
          available: -3000n,
        }}
        format={format}
        selectedNames={["Power", "Food"]}
      />,
    );
    expect(screen.getByRole("heading", { name: "2 Categories Selected" })).toBeInTheDocument();
    expect(screen.getByText("Power, Food")).toBeInTheDocument();
    expect(screen.getByText("Assigned in October").nextSibling).toHaveTextContent("A0");
    expect(screen.getByText("Activity").nextSibling).toHaveTextContent("A-3000");
  });
});
