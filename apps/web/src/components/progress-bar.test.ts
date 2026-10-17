import { describe, expect, it } from "vitest";
import { barLabel } from "./progress-bar";

describe("barLabel", () => {
  it("says what the bar's colours show", () => {
    expect(
      barLabel({
        tone: "underfunded",
        sections: [
          {
            kind: "target",
            size: "1000",
            segments: [
              { kind: "spent", amount: "250" },
              { kind: "available", amount: "500" },
            ],
          },
        ],
      } as never),
    ).toBe("Progress: Needs more, 25% spent, 50% available");
    expect(
      barLabel({
        tone: "funded",
        sections: [
          { kind: "target", size: "100", segments: [{ kind: "overspent", amount: "100" }] },
        ],
      } as never),
    ).toBe("Progress: On track, 100% overspent");
  });
});
