import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RegisterSearch } from "@/lib/register-filters";
import { RegisterToolbar } from "./register-toolbar";

function renderToolbar(search: RegisterSearch = {}) {
  const onChange = vi.fn();
  const view = render(
    <RegisterToolbar
      search={search}
      onChange={onChange}
      categories={[{ id: "groceries", name: "Groceries", group: "Everyday" }]}
      payees={[{ id: "p1", name: "Costco", lastCategoryId: null }]}
      flags={[{ color: "red", name: "Reimbursable" }]}
    />,
  );
  return { onChange, ...view };
}

describe("RegisterToolbar", () => {
  it("searches once typing pauses, replacing the history entry", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { onChange } = renderToolbar();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText("Search transactions"), "costco");
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ q: "costco" }, true);
    vi.useRealTimers();
  });

  it("applies filters at once and offers custom dates", async () => {
    const { onChange, rerender } = renderToolbar();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Cleared"), "uncleared");
    expect(onChange).toHaveBeenLastCalledWith({ cleared: "uncleared" });
    await user.selectOptions(screen.getByLabelText("Flag"), "Reimbursable (Red)");
    expect(onChange).toHaveBeenLastCalledWith({ flag: "red" });
    await user.selectOptions(screen.getByLabelText("Dates"), "Custom");
    expect(onChange).toHaveBeenLastCalledWith({ range: "custom" });

    rerender(
      <RegisterToolbar
        search={{ range: "custom", cleared: "uncleared" }}
        onChange={onChange}
        categories={[]}
        payees={[]}
        flags={[]}
      />,
    );
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ cleared: undefined, range: undefined, q: undefined }),
    );
  });

  it("hides Clear filters when nothing is filtered", () => {
    renderToolbar({ sort: "amount" });
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });
});
