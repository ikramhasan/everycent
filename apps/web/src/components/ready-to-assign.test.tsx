import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadyToAssignBanner } from "./ready-to-assign";

const format = (a: string) => `$${Number(a) / 100}`;

describe("ReadyToAssignBanner", () => {
  it("shows money ready to assign", () => {
    render(<ReadyToAssignBanner amount="5000" overdraft={false} format={format} />);
    expect(screen.getByText("$50")).toBeInTheDocument();
    expect(screen.getByText("Ready to Assign")).toBeInTheDocument();
  });

  it("says when all money is assigned", () => {
    render(<ReadyToAssignBanner amount="0" overdraft={false} format={format} />);
    expect(screen.getByText("All Money Assigned")).toBeInTheDocument();
  });

  it("warns when more was assigned than there is, with its action", () => {
    render(
      <ReadyToAssignBanner
        amount="-500"
        overdraft={false}
        format={format}
        action={<button type="button">Fix This</button>}
      />,
    );
    expect(screen.getByText("You assigned more than you have")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fix This" })).toBeInTheDocument();
  });

  it("calls an overdraft by its name, without Fix This", () => {
    render(
      <ReadyToAssignBanner
        amount="-500"
        overdraft
        format={format}
        action={<button type="button">Fix This</button>}
      />,
    );
    expect(screen.getByText("Overdraft? We can help with that!")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fix This" })).not.toBeInTheDocument();
  });
});
