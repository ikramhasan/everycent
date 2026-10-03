import { describe, expect, it } from "vitest";
import {
  type CategoryTarget,
  dueDayIn,
  ordinal,
  type TargetNeed,
  targetDueLine,
  targetHeading,
  targetLines,
  targetMessage,
  targetRowNote,
} from "./targets";

const format = (minor: string) => `$${(Number(minor) / 100).toFixed(2)}`;

const target = (extra: Partial<CategoryTarget> = {}): CategoryTarget => ({
  cadence: "monthly",
  behavior: "set_aside",
  amount: "10000",
  dueDay: null,
  dueDate: null,
  repeatEvery: null,
  repeatUnit: null,
  startMonth: "2026-10",
  ...extra,
});
const need = (
  needed: string,
  funded: string,
  underfunded: string,
  dueDate: string | null = null,
): TargetNeed => ({ needed, funded, underfunded, dueDate });

describe("target wording", () => {
  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "31st",
    ]);
  });

  it("falls due on the last day by default", () => {
    expect(dueDayIn(null, "2026-10")).toBe(31);
    expect(dueDayIn(null, "2026-11")).toBe(30);
    expect(dueDayIn(15, "2026-11")).toBe(15);
    expect(dueDayIn(31, "2026-02")).toBe(28);
  });

  it("matches YNAB's inspector headings", () => {
    expect(targetHeading(target(), "$100.00")).toBe("Set Aside Another $100.00 Each Month");
    expect(targetHeading(target({ behavior: "refill" }), "$100.00")).toBe(
      "Refill Up to $100.00 Each Month",
    );
    expect(targetHeading(target({ cadence: "weekly", dueDay: 6 }), "$10.00")).toBe(
      "Set Aside Another $10.00 Each Week",
    );
    expect(targetHeading(target({ cadence: "yearly" }), "$1,000.00")).toBe(
      "Set Aside Another $1,000.00 Each Year",
    );
    expect(
      targetHeading(target({ cadence: "custom", repeatEvery: 2, repeatUnit: "month" }), "$300.00"),
    ).toBe("Set Aside Another $300.00 Every 2 Months");
    expect(targetHeading(target({ cadence: "custom" }), "$300.00")).toBe(
      "Set Aside Another $300.00",
    );
    expect(targetHeading(target({ cadence: "custom", behavior: "balance" }), "$300.00")).toBe(
      "Have a Balance of $300.00",
    );
  });

  it("matches YNAB's due lines", () => {
    expect(targetDueLine(target(), null)).toBe("By the End of the Month");
    expect(targetDueLine(target({ dueDay: 15 }), null)).toBe("By the 15th of the Month");
    expect(targetDueLine(target({ cadence: "weekly", dueDay: 6 }), null)).toBe("By Saturday");
    expect(
      targetDueLine(target({ cadence: "yearly", dueDate: "2026-12-30" }), {
        dueDate: "2026-12-30",
      }),
    ).toBe("By Dec 30 2026");
    const balance = target({ cadence: "custom", behavior: "balance" });
    expect(targetDueLine(balance, null)).toBe("Eventually");
    expect(targetDueLine({ ...balance, dueDate: "2026-12-01" }, null)).toBe("By Dec 2026");
  });

  it("matches YNAB's row notes", () => {
    const note = (t: CategoryTarget, n: TargetNeed, month = "2026-10") =>
      targetRowNote(t, n, month, format).text;
    expect(note(target(), need("10000", "4000", "6000"))).toBe("$60.00 more needed by the 31st");
    expect(note(target(), need("10000", "0", "10000"))).toBe("$100.00 more needed by the 31st");
    expect(note(target({ behavior: "refill" }), need("10000", "0", "10000"))).toBe(
      "$100.00 needed by the 31st",
    );
    expect(note(target(), need("10000", "10000", "0"))).toBe("Funded");
    expect(note(target({ cadence: "weekly", dueDay: 6 }), need("5000", "0", "5000"))).toBe(
      "$50.00 more needed this month",
    );
    const yearly = target({ cadence: "yearly", dueDate: "2026-12-30" });
    expect(note(yearly, need("100000", "0", "33334", "2026-12-30"))).toBe(
      "$333.34 more needed this month",
    );
    expect(note(yearly, need("100000", "33334", "66666", "2026-12-30"), "2026-12")).toBe(
      "$666.66 more needed by December 30th",
    );
    expect(note(yearly, need("100000", "33334", "0", "2026-12-30"))).toBe("On Track");
    const eventually = target({ cadence: "custom", behavior: "balance", amount: "30000" });
    expect(note(eventually, need("30000", "0", "0"))).toBe("$300.00 needed eventually");
    expect(
      note({ ...eventually, dueDate: "2026-12-01" }, need("30000", "0", "10000", "2026-12-01")),
    ).toBe("$100.00 needed this month");
  });

  it("labels the inspector lines and message per kind", () => {
    const yearly = target({ cadence: "yearly", dueDate: "2026-12-30" });
    const n = need("100000", "0", "33334", "2026-12-30");
    expect(targetLines(yearly, n, format).map((l) => l.label)).toEqual([
      "Total to Assign by Dec 30 2026",
      "Assigned So Far",
      "To Go",
    ]);
    expect(targetMessage(yearly, n, format)).toEqual({
      prompt: "$333.34",
      suffix: " this month to stay on track",
    });
    expect(targetMessage(yearly, need("100000", "33334", "0"), format)).toEqual({
      text: "You're on track to meet your target!",
    });
    expect(targetMessage(target(), need("10000", "4000", "6000"), format)).toEqual({
      prompt: "$60.00 more",
      suffix: " to meet your target",
    });
    const eventually = target({ cadence: "custom", behavior: "balance" });
    expect(targetLines(eventually, need("30000", "0", "0"), format).map((l) => l.label)).toEqual([
      "Balance Needed",
      "Current Balance",
      "To Go",
    ]);
    expect(targetMessage(eventually, need("30000", "0", "0"), format)).toBeNull();
  });
});
