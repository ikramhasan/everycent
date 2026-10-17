import { ThemeProvider } from "@everycent/ui/lib/theme";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DisplayOptionsDialog } from "./display-options-dialog";
import { AvailablePill } from "./move-money";

function setup() {
  const onOpenChange = vi.fn();
  render(
    <ThemeProvider>
      <DisplayOptionsDialog open onOpenChange={onOpenChange} />
      <AvailablePill amount="-500" format={(a) => a} />
      <AvailablePill amount="500" format={(a) => a} caution />
      <AvailablePill amount="500" format={(a) => a} />
    </ThemeProvider>,
  );
  return { onOpenChange, user: userEvent.setup() };
}

const pill = (tone: string) => document.querySelector(`[data-tone=${tone}]`) as HTMLElement;

describe("DisplayOptionsDialog", () => {
  beforeEach(() => localStorage.clear());

  it("applies Differentiate Without Color and progress bars only on Apply", async () => {
    const { user, onOpenChange } = setup();
    expect(pill("negative").className).toContain("bg-red-100");
    await user.click(screen.getByRole("radio", { name: "Differentiate Without Color" }));
    await user.click(screen.getByRole("radio", { name: "Off" }));
    expect(pill("negative").className).toContain("bg-red-100");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(pill("negative").className).toContain("bg-[#bf2e3b]");
    expect(pill("caution").className).toContain("border-black");
    // Funded pills keep their look.
    expect(pill("positive").className).toContain("bg-green-100");
    expect(localStorage.getItem("everycent:differentiate-without-color")).toBe("true");
    expect(localStorage.getItem("everycent:progress-bars")).toBe("off");
  });

  it("changes nothing on Cancel", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    await user.click(screen.getByRole("radio", { name: "Differentiate Without Color" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(pill("negative").className).toContain("bg-red-100");
    expect(localStorage.getItem("theme")).not.toBe("dark");
  });
});
