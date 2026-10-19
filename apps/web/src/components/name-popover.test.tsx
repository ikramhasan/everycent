import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NamePopover } from "./name-popover";

// The picker loads Emojibase's data from our own origin; serve it from the package.
const require = createRequire(import.meta.url);
vi.stubGlobal("fetch", async (url: string) => {
  const file = String(url).endsWith("messages.json") ? "messages.json" : "data.json";
  const body = readFileSync(require.resolve(`emojibase-data/en/${file}`), "utf8");
  return new Response(body, { headers: { "Content-Type": "application/json" } });
});

function renderPopover(onSubmit: (values: { name: string }) => void) {
  render(
    <NamePopover
      title="New category group"
      withEmoji
      submitLabel="Add"
      onSubmit={onSubmit}
      trigger={<button type="button">Open</button>}
    />,
  );
}

describe("NamePopover withEmoji", () => {
  it("puts a picked emoji in front of the name", async () => {
    const onSubmit = vi.fn();
    renderPopover(onSubmit);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Add an emoji" }));
    await userEvent.type(screen.getByLabelText("Search emoji"), "money bag");
    // The footer names the first match once the search has run; Enter picks it.
    await screen.findAllByText("Money bag");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByLabelText("New category group")).toHaveFocus());
    // Emojibase gives the fully-qualified form, with the emoji presentation selector.
    const bag = "💰\uFE0F";
    expect(screen.getByRole("button", { name: `Emoji: ${bag}. Change emoji` })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New category group"), "Savings");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onSubmit).toHaveBeenCalledWith({ name: `${bag} Savings`, note: "" });
  });

  it("leaves the name alone without one", async () => {
    const onSubmit = vi.fn();
    renderPopover(onSubmit);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.type(screen.getByLabelText("New category group"), "Savings");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Savings", note: "" });
  });
});
