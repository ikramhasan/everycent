import type { components } from "@everycent/api-client";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { groupOptions, SelectionBar } from "./selection-bar";

type Summary = components["schemas"]["SelectionSummary"];

const summary = (patch: Partial<Summary>): Summary => ({
  count: 2,
  total: "-200",
  currency: "USD",
  uncleared: 0,
  cleared: 0,
  reconciled: 0,
  reconciledTransfers: 0,
  categorizable: 2,
  unapproved: 0,
  splits: 0,
  splitsWithTransfers: 0,
  deletable: 2,
  ...patch,
});

const categories = [
  { id: "rta", name: "Ready to Assign", group: "Inflow" },
  { id: "rent", name: "Rent", group: "Bills" },
  { id: "power", name: "Power", group: "Bills" },
  { id: "food", name: "Groceries", group: "Needs" },
];

function bar(s: Summary, props: Partial<Parameters<typeof SelectionBar>[0]> = {}) {
  const onAction = vi.fn();
  return {
    onAction,
    ...render(
      <SelectionBar
        summary={s}
        total="-$2.00"
        allMatching={false}
        canSelectAll={false}
        onSelectAll={vi.fn()}
        onClear={vi.fn()}
        flags={[]}
        categories={categories}
        moveTargets={[]}
        pending={false}
        onAction={onAction}
        {...props}
      />,
    ),
  };
}

/** Opens Categorize, then `group`'s submenu, and picks `category`. */
async function categorizeAs(group: string, category: string) {
  screen.getByRole("button", { name: "Categorize" }).focus();
  await userEvent.keyboard("{Enter}");
  const trigger = await screen.findByRole("menuitem", { name: group });
  trigger.focus();
  await userEvent.keyboard("{ArrowRight}");
  await userEvent.click(await screen.findByRole("menuitem", { name: category }));
}

describe("SelectionBar", () => {
  it("offers YNAB's Export # Transactions in More", async () => {
    const onExport = vi.fn();
    bar(summary({ count: 2 }), { onExport });
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Export 2 Transactions" }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it("offers Approve and Reject with unapproved rows, Flag and Clear moving into More", async () => {
    const { onAction } = bar(summary({ unapproved: 1, uncleared: 2 }));
    expect(screen.queryByRole("button", { name: /Flag/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Clear$/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "approve" });
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onAction).toHaveBeenLastCalledWith({ type: "reject" });
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("menuitem", { name: "Mark as Cleared" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Flag" })).toBeVisible();
  });

  it("offers neither when every row is approved", () => {
    bar(summary({}));
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("offers Clear only when every selected row is uncleared, as YNAB does", () => {
    const { unmount } = bar(summary({ uncleared: 2 }));
    expect(screen.getByRole("button", { name: /Clear$/ })).toBeVisible();
    unmount();
    bar(summary({ cleared: 2 }));
    expect(screen.queryByRole("button", { name: /^Clear$/ })).toBeNull();
  });

  it("categorizes from a menu of groups with their categories as submenus, as YNAB", async () => {
    const { onAction } = bar(summary({}));
    screen.getByRole("button", { name: "Categorize" }).focus();
    await userEvent.keyboard("{Enter}");
    const menu = await screen.findByRole("menu", { name: "Categorize" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((m) => m.textContent),
    ).toEqual(["Inflow", "Bills", "Needs"]);
    await userEvent.keyboard("{Escape}");
    await categorizeAs("Bills", "Power");
    expect(onAction).toHaveBeenCalledWith({ type: "categorize", categoryId: "power" });
  });

  it("asks before un-splitting a selected split", async () => {
    const { onAction } = bar(summary({ splits: 1 }));
    await categorizeAs("Inflow", "Ready to Assign");
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Un-split and Categorize Split Transaction?");
    expect(dialog).toHaveTextContent(
      'If you categorize the split transaction as "Inflow: Ready to Assign" we will un-split it.',
    );
    expect(onAction).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Categorize" }));
    expect(onAction).toHaveBeenCalledWith({ type: "categorize", categoryId: "rta" });
  });
});

// YNAB, 2026-10-15 (x-c11-136 Sched, S1, S2, S3): scheduled splits count, and the transfer
// wording shows only when a selected split has a transfer line.
describe("un-split warning", () => {
  async function warning(
    s: Summary,
    scheduledSplits?: { splits: number; splitsWithTransfers: number },
  ) {
    bar(s, { scheduledCount: scheduledSplits?.splits ?? 0, scheduledSplits });
    await categorizeAs("Bills", "Rent");
    return screen.findByRole("alertdialog");
  }

  it("counts a scheduled split selected alone", async () => {
    const dialog = await warning(summary({ count: 0, categorizable: 0 }), {
      splits: 1,
      splitsWithTransfers: 0,
    });
    expect(dialog).toHaveTextContent("Un-split and Categorize Split Transaction?");
    expect(dialog).toHaveTextContent("You have a split transaction selected.");
  });

  it("counts scheduled splits with the transactions", async () => {
    const dialog = await warning(summary({ splits: 1 }), { splits: 1, splitsWithTransfers: 0 });
    expect(dialog).toHaveTextContent("Un-split and Categorize Split Transactions?");
    expect(dialog).toHaveTextContent("You have 2 split transactions selected.");
    expect(dialog).toHaveTextContent(
      'If you categorize these split transactions as "Rent" we will un-split them.',
    );
  });

  it("mentions transfers only when a selected split has a transfer line", async () => {
    const dialog = await warning(summary({ splits: 2, splitsWithTransfers: 1 }), {
      splits: 1,
      splitsWithTransfers: 0,
    });
    expect(dialog).toHaveTextContent("You have 3 split transactions selected.");
    expect(dialog).toHaveTextContent(
      "we will un-split the transactions, as long as they don't contain transfers.",
    );
  });

  it("doesn't ask when every selected split has a transfer line", async () => {
    const { onAction } = bar(summary({ splits: 1, splitsWithTransfers: 1 }), {
      scheduledCount: 1,
      scheduledSplits: { splits: 1, splitsWithTransfers: 1 },
    });
    await categorizeAs("Bills", "Rent");
    expect(onAction).toHaveBeenCalledWith({ type: "categorize", categoryId: "rent" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("groupOptions", () => {
  it("keeps each group's run of options, in order", () => {
    expect(groupOptions(categories).map((g) => [g.name, g.categories.map((c) => c.id)])).toEqual([
      ["Inflow", ["rta"]],
      ["Bills", ["rent", "power"]],
      ["Needs", ["food"]],
    ]);
  });
});
