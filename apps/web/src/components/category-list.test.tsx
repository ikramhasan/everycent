import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CategoryList as CategoryListData } from "@/lib/categories";
import type { BudgetMonthData } from "@/lib/months";
import { CategoryList, type CategoryListActions } from "./category-list";

const data: CategoryListData = {
  readyToAssignCategoryId: "rta",
  groups: [
    {
      id: "g1",
      name: "Bills",
      hidden: false,
      kind: null,
      categories: [
        {
          id: "c1",
          groupId: "g1",
          name: "Rent",
          note: "",
          hidden: false,
          linkedAccountId: null,
          hasTransactions: false,
        },
        {
          id: "c2",
          groupId: "g1",
          name: "Electric",
          note: "Pays quarterly",
          hidden: false,
          linkedAccountId: null,
          hasTransactions: false,
        },
        {
          id: "c3",
          groupId: "g1",
          name: "Cable",
          note: "",
          hidden: true,
          linkedAccountId: null,
          hasTransactions: false,
        },
      ],
    },
    { id: "g2", name: "Old", hidden: true, kind: null, categories: [] },
  ],
};

const withCards: CategoryListData = {
  readyToAssignCategoryId: "rta",
  groups: [
    {
      id: "cc",
      name: "Credit Card Payments",
      hidden: false,
      kind: "credit_card_payments",
      categories: [
        {
          id: "pay",
          groupId: "cc",
          name: "Visa",
          note: "",
          hidden: false,
          linkedAccountId: "acct",
          hasTransactions: false,
        },
      ],
    },
    {
      id: "g1",
      name: "Bills",
      hidden: false,
      kind: null,
      categories: [
        {
          id: "c1",
          groupId: "g1",
          name: "Rent",
          note: "",
          hidden: false,
          linkedAccountId: null,
          hasTransactions: true,
        },
        {
          id: "c2",
          groupId: "g1",
          name: "Water",
          note: "",
          hidden: false,
          linkedAccountId: null,
          hasTransactions: false,
        },
      ],
    },
  ],
};

function makeActions() {
  return Object.fromEntries(
    [
      "createGroup",
      "createCategory",
      "updateGroup",
      "updateCategory",
      "deleteGroup",
      "deleteCategory",
      "moveGroup",
      "moveCategory",
    ].map((name) => [name, vi.fn().mockResolvedValue(undefined)]),
  ) as unknown as CategoryListActions & {
    [K in keyof CategoryListActions]: ReturnType<typeof vi.fn>;
  };
}

function renderList(list: CategoryListData = data) {
  const actions = makeActions();
  render(<CategoryList data={list} actions={actions} />);
  return actions;
}

const totals = (assigned: string, activity: string, available: string) => ({
  assigned,
  activity,
  available,
});

const month: BudgetMonthData = {
  month: "2026-10",
  currency: "USD",
  firstMonth: "2026-09",
  lastMonth: "2026-11",
  categories: [
    { categoryId: "c1", ...totals("100", "-30", "70") },
    { categoryId: "c2", ...totals("0", "-5", "-5") },
    { categoryId: "c3", ...totals("0", "-2", "-2") },
  ],
  groups: [{ groupId: "g1", ...totals("100", "-35", "65") }],
  hidden: totals("0", "-2", "-2"),
  uncategorized: { activity: "-9", available: "-9" },
};

function renderWithFigures() {
  render(
    <CategoryList
      data={data}
      actions={makeActions()}
      figures={{ month, format: (a) => `A${a}` }}
    />,
  );
}

describe("CategoryList", () => {
  it("shows visible groups and categories in order", () => {
    renderList();
    const bills = screen.getByRole("region", { name: "Bills" });
    const names = within(bills)
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((t) => t && !t.startsWith("Reorder"));
    expect(names).toEqual(["Bills", "Rent", "Electric"]);
    expect(screen.queryByText("Cable")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Has a note")).toBeInTheDocument();
  });

  it("renames a category and edits its note", async () => {
    const actions = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Electric" }));
    const name = screen.getByLabelText("Category name");
    await userEvent.clear(name);
    await userEvent.type(name, "Power");
    await userEvent.clear(screen.getByLabelText("Note"));
    await userEvent.type(screen.getByLabelText("Note"), "Monthly now");
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(actions.updateCategory).toHaveBeenCalledWith("c2", {
      name: "Power",
      note: "Monthly now",
    });
  });

  it("adds a category to a group", async () => {
    const actions = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Add a category to Bills" }));
    await userEvent.type(screen.getByLabelText("New category in Bills"), "Water");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(actions.createCategory).toHaveBeenCalledWith("g1", "Water");
  });

  it("adds a category group", async () => {
    const actions = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Category Group" }));
    await userEvent.type(screen.getByLabelText("New category group"), "Kids");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(actions.createGroup).toHaveBeenCalledWith("Kids");
  });

  it("hides a category from its editor", async () => {
    const actions = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Rent" }));
    await userEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(actions.updateCategory).toHaveBeenCalledWith("c1", { hidden: true });
  });

  it("asks before deleting a group", async () => {
    const actions = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Bills" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete “Bills”?");
    expect(actions.deleteGroup).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(actions.deleteGroup).toHaveBeenCalledWith("g1", undefined);
  });

  it("unhides a category or group from the Hidden Categories row", async () => {
    const actions = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Hidden Categories" }));
    expect(screen.getByText("Click to unhide a category")).toBeInTheDocument();
    expect(screen.getByText("Bills:")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cable" }));
    expect(actions.updateCategory).toHaveBeenCalledWith("c3", { hidden: false });
    await userEvent.click(screen.getByRole("button", { name: "Hidden Categories" }));
    await userEvent.click(screen.getByRole("button", { name: "Old" }));
    expect(actions.updateGroup).toHaveBeenCalledWith("g2", { hidden: false });
  });

  it("shows all hidden categories at once", async () => {
    const actions = renderList();
    await userEvent.click(screen.getByRole("button", { name: "Hidden Categories" }));
    await userEvent.click(screen.getByRole("button", { name: "Show all hidden categories" }));
    expect(actions.updateCategory).toHaveBeenCalledWith("c3", { hidden: false });
    expect(actions.updateGroup).toHaveBeenCalledWith("g2", { hidden: false });
  });

  it("shows the month's numbers for categories, groups and hidden categories", () => {
    renderWithFigures();
    const bills = screen.getByRole("region", { name: "Bills" });
    for (const amount of ["A-30", "A70", "A-35", "A65"]) {
      expect(within(bills).getByText(amount)).toBeInTheDocument();
    }
    expect(within(bills).getAllByText("A-5")).toHaveLength(2);
    // Hidden categories' totals sit on the Hidden Categories row, not in their group.
    expect(within(bills).queryByText("A-2")).not.toBeInTheDocument();
    expect(screen.getAllByText("A-2")).toHaveLength(2);
    expect(screen.getByText("Uncategorized Transactions")).toBeInTheDocument();
    expect(screen.getAllByText("A-9")).toHaveLength(2);
  });

  it("collapses a group and all groups", async () => {
    const onCollapsedChange = vi.fn();
    const { rerender } = render(
      <CategoryList
        data={data}
        actions={makeActions()}
        collapsed={new Set()}
        onCollapsedChange={onCollapsedChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Collapse Bills" }));
    expect(onCollapsedChange).toHaveBeenLastCalledWith(new Set(["g1"]));
    rerender(
      <CategoryList
        data={data}
        actions={makeActions()}
        collapsed={new Set(["g1"])}
        onCollapsedChange={onCollapsedChange}
      />,
    );
    expect(screen.queryByRole("button", { name: "Rent" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Expand all groups" }));
    expect(onCollapsedChange).toHaveBeenLastCalledWith(new Set());
  });

  it("locks the Credit Card Payments group and payment category names", async () => {
    renderList(withCards);
    expect(screen.queryByRole("button", { name: "Credit Card Payments" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add a category to Credit Card Payments" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Reorder Credit Card Payments" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Visa" }));
    expect(screen.getByLabelText("Category name")).toHaveAttribute("readonly");
    expect(screen.getByText(/Rename the account instead/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("asks where to move a category's transactions before deleting it", async () => {
    const actions = renderList(withCards);
    await userEvent.click(screen.getByRole("button", { name: "Rent" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "Delete" });
    expect(confirm).toBeDisabled();

    const select = within(dialog).getByLabelText("Move its transactions to");
    const options = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    // Not itself, and never a payment category.
    expect(options).toEqual(["Select a category…", "Water"]);
    await userEvent.selectOptions(select, "c2");
    await userEvent.click(confirm);
    expect(actions.deleteCategory).toHaveBeenCalledWith("c1", "c2");
  });

  it("deletes a category without history straight away", async () => {
    const actions = renderList(withCards);
    await userEvent.click(screen.getByRole("button", { name: "Water" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).queryByLabelText("Move its transactions to")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(actions.deleteCategory).toHaveBeenCalledWith("c2", undefined);
  });
});
