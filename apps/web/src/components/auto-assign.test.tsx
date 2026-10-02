import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NO_AUTO_ASSIGN } from "@/test/fixtures";
import { AutoAssignPanel } from "./auto-assign";

const categories = [
  {
    categoryId: "rent",
    assigned: "1000",
    activity: "0",
    available: "1000",
    autoAssign: { ...NO_AUTO_ASSIGN, assignedLastMonth: "3000", resetAvailable: "0" },
  },
  {
    categoryId: "food",
    assigned: "0",
    activity: "0",
    available: "0",
    autoAssign: { ...NO_AUTO_ASSIGN, assignedLastMonth: "0" },
  },
];
const names = new Map([
  ["rent", { name: "Rent", group: "Bills" }],
  ["food", { name: "Food", group: "Needs" }],
]);
const format = (a: string) => `A${a}`;

describe("AutoAssignPanel", () => {
  it("previews the whole plan before assigning", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <AutoAssignPanel
        categories={categories}
        names={names}
        selection={false}
        format={format}
        onApply={onApply}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Assigned Last Month A3000" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/for 1 category/)).toBeInTheDocument();
    expect(within(dialog).getByText("Rent")).toBeInTheDocument();
    expect(within(dialog).getByText("+A2000")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Update Assigned Amounts" }));
    expect(onApply).toHaveBeenCalledWith("assignedLastMonth");
  });

  it("applies straight away to selected categories, with singular labels for one", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <AutoAssignPanel
        categories={categories.slice(0, 1)}
        names={names}
        selection
        format={format}
        onApply={onApply}
      />,
    );
    expect(screen.getByRole("button", { name: "Reset Available Amount A0" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Reset Assigned Amount/ }));
    expect(onApply).toHaveBeenCalledWith("resetAssigned");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("says so when the view has no categories", async () => {
    const user = userEvent.setup();
    const onViewAll = vi.fn();
    render(
      <AutoAssignPanel
        categories={[]}
        names={names}
        selection={false}
        format={format}
        onApply={vi.fn()}
        onViewAll={onViewAll}
      />,
    );
    expect(screen.getByText("This view has no categories.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Average Spent/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View All Categories" }));
    expect(onViewAll).toHaveBeenCalled();
  });

  it("uses singular labels when one category is in view", () => {
    render(
      <AutoAssignPanel
        categories={categories.slice(0, 1)}
        names={names}
        selection={false}
        format={format}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^Reset Assigned Amount A/ })).toBeInTheDocument();
  });
});
