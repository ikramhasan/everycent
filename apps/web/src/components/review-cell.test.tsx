import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { REVIEW_SEARCH, ReviewBanner } from "./review-banner";
import { NeedsCategoryPill, ReviewCell } from "./review-cell";

function cell(props: Partial<Parameters<typeof ReviewCell>[0]>) {
  const handlers = { onApprove: vi.fn(), onReject: vi.fn(), onCategorize: vi.fn() };
  render(<ReviewCell approved needsCategory={false} {...handlers} {...props} />);
  return handlers;
}

describe("ReviewCell", () => {
  it("offers Approve Transaction and Reject Transaction on an unapproved row", async () => {
    const { onApprove, onReject } = cell({ approved: false, needsCategory: true });
    await userEvent.click(screen.getByRole("button", { name: "This transaction needs approval" }));
    await userEvent.click(await screen.findByRole("button", { name: "Approve Transaction" }));
    expect(onApprove).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Reject Transaction" }));
    expect(onReject).toHaveBeenCalledOnce();
  });

  it("opens the category of an approved row that needs one", async () => {
    const { onCategorize } = cell({ needsCategory: true });
    await userEvent.click(
      screen.getByRole("button", { name: "This transaction needs a category" }),
    );
    expect(onCategorize).toHaveBeenCalledOnce();
  });

  it("is empty when nothing needs review", () => {
    cell({});
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reads YNAB's pill", () => {
    render(<NeedsCategoryPill />);
    expect(screen.getByText("This needs a category")).toBeVisible();
  });
});

describe("ReviewBanner", () => {
  it("counts what's left to approve or categorize, and View searches for it", async () => {
    const onView = vi.fn();
    const { rerender } = render(<ReviewBanner count={3} onView={onView} />);
    expect(screen.getByText("3 new transactions to approve or categorize.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "View" }));
    expect(onView).toHaveBeenCalledOnce();
    rerender(<ReviewBanner count={1} onView={onView} />);
    expect(screen.getByText("1 new transaction to approve or categorize.")).toBeVisible();
    rerender(<ReviewBanner count={0} onView={onView} />);
    expect(screen.queryByRole("region")).toBeNull();
    expect(REVIEW_SEARCH).toBe("Is: Unapproved or Needs Category, ");
  });
});
