import { describe, expect, it } from "vitest";
import { checkDraft } from "./transaction-draft";

const read = (date: string | null) => ({
  found: true,
  date,
  payeeId: null,
  newPayeeName: null,
  direction: "outflow" as const,
  total: null,
  currency: null,
  categoryId: null,
  lines: [],
  memo: null,
  note: null,
});
const lists = { categories: [], payees: [], currency: "USD" as const, today: "2026-10-18" };

describe("checkDraft", () => {
  it("keeps only a real calendar date that isn't after today", () => {
    expect(checkDraft(read("2026-10-18"), lists).date).toBe("2026-10-18");
    expect(checkDraft(read("2024-02-29"), lists).date).toBe("2024-02-29");
    // Date.parse would take these as Mar 2 and Mar 1.
    expect(checkDraft(read("2026-02-30"), lists).date).toBeNull();
    expect(checkDraft(read("2025-02-29"), lists).date).toBeNull();
    // A misread year: it would make the transaction a scheduled one.
    expect(checkDraft(read("2027-10-17"), lists).date).toBeNull();
    expect(checkDraft(read("Oct 17"), lists).date).toBeNull();
  });
});
