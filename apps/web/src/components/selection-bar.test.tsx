import type { components } from "@everycent/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectionBar } from "./selection-bar";

type Summary = components["schemas"]["SelectionSummary"];

const summary = (patch: Partial<Summary>): Summary => ({
  count: 2,
  total: "-200",
  uncleared: 0,
  cleared: 0,
  reconciled: 0,
  reconciledTransfers: 0,
  categorizable: 2,
  splits: 0,
  splitsWithTransfers: 0,
  deletable: 2,
  ...patch,
});

function bar(s: Summary) {
  return render(
    <SelectionBar
      summary={s}
      total="-$2.00"
      allMatching={false}
      canSelectAll={false}
      onSelectAll={vi.fn()}
      onClear={vi.fn()}
      flags={[]}
      categories={[]}
      moveTargets={[]}
      pending={false}
      onAction={vi.fn()}
    />,
  );
}

describe("SelectionBar", () => {
  it("offers Clear only when every selected row is uncleared, as YNAB does", () => {
    const { unmount } = bar(summary({ uncleared: 2 }));
    expect(screen.getByRole("button", { name: /Clear$/ })).toBeVisible();
    unmount();
    bar(summary({ cleared: 2 }));
    expect(screen.queryByRole("button", { name: /^Clear$/ })).toBeNull();
  });
});
