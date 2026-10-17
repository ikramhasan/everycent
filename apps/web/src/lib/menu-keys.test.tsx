import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { menuKeyDown } from "./menu-keys";

describe("menuKeyDown", () => {
  it("moves through enabled items with the arrows, wrapping, and jumps with Home/End", async () => {
    render(
      // biome-ignore lint/a11y/useKeyWithClickEvents: a test menu
      <div role="menu" onKeyDown={menuKeyDown}>
        <button type="button" role="menuitem">
          One
        </button>
        <button type="button" role="menuitem" disabled>
          Off
        </button>
        <button type="button" role="menuitemradio" aria-checked={false}>
          Two
        </button>
        <button type="button" role="menuitem">
          Three
        </button>
      </div>,
    );
    const user = userEvent.setup();
    screen.getByRole("menuitem", { name: "One" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "Two" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Three" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Three" })).toHaveFocus();
  });
});
