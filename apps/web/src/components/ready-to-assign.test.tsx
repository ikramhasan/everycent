import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadyToAssignBanner } from "./ready-to-assign";

const format = (a: string) => `$${Number(a) / 100}`;

describe("ReadyToAssignBanner", () => {
  it("shows money ready to assign", () => {
    render(<ReadyToAssignBanner month="2026-10" current="2026-10" amount="5000" format={format} />);
    expect(screen.getByText("$50")).toBeInTheDocument();
    expect(screen.getByText("Ready to Assign")).toBeInTheDocument();
  });

  it("says when all money is assigned", () => {
    render(<ReadyToAssignBanner month="2026-10" current="2026-10" amount="0" format={format} />);
    expect(screen.getByText("All Money Assigned")).toBeInTheDocument();
  });

  it("warns when more was assigned than there is", () => {
    render(<ReadyToAssignBanner month="2026-11" current="2026-10" amount="-500" format={format} />);
    expect(screen.getByText("You assigned more than you have")).toBeInTheDocument();
  });
});
