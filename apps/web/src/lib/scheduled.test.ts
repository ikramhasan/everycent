import { describe, expect, it } from "vitest";
import type { MoneySettings } from "./money-input";
import {
  draftFromScheduled,
  isScheduled,
  type ScheduledTransaction,
  scheduleCreateBody,
  scheduleRestoreBody,
  scheduleUpdateBody,
} from "./scheduled";
import { emptyDraft } from "./transactions";

const settings: MoneySettings = {
  currency: "USD",
  numberFormat: "comma_dot",
  currencySymbolPosition: "before",
  dateFormat: "MM/DD/YYYY",
};
const TODAY = "2026-10-11";

const row: ScheduledTransaction = {
  id: "s1",
  scheduledTransactionId: "s1",
  kind: "schedule",
  accountId: "checking",
  accountName: "Checking",
  frequency: "monthly",
  dateFirst: "2026-10-31",
  dateNext: "2026-11-30",
  amount: "-2500",
  currency: "USD",
  payeeId: "p1",
  payeeName: "Gym",
  categoryId: "c1",
  categoryName: "Fitness",
  memo: "m",
  flag: "red",
  transferAccountId: null,
  subtransactions: [],
};

/** The other account's view of a transfer from Checking to Savings. */
const mirror: ScheduledTransaction = {
  ...row,
  id: "s2~savings",
  scheduledTransactionId: "s2",
  kind: "transfer",
  accountId: "savings",
  accountName: "Savings",
  amount: "5000",
  payeeId: null,
  payeeName: "Transfer : Checking",
  categoryId: null,
  categoryName: null,
  transferAccountId: "checking",
};

describe("isScheduled", () => {
  it("schedules a repeat or a date still ahead, as YNAB does", () => {
    expect(isScheduled({ date: TODAY, frequency: "never" }, TODAY)).toBe(false);
    expect(isScheduled({ date: TODAY }, TODAY)).toBe(false);
    expect(isScheduled({ date: "2026-10-12", frequency: "never" }, TODAY)).toBe(true);
    expect(isScheduled({ date: "2026-09-01", frequency: "monthly" }, TODAY)).toBe(true);
  });
});

describe("scheduleCreateBody", () => {
  it("sends the repeat and today, without a cleared state or line ids", () => {
    const draft = {
      ...emptyDraft("checking", "2026-10-20"),
      frequency: "weekly" as const,
      payeeName: "Shop",
      outflow: "30",
      lines: [
        {
          key: "a",
          id: "old",
          payeeName: "",
          transferAccountId: null,
          categoryId: "c1",
          memo: "",
          outflow: "10",
          inflow: "",
        },
        {
          key: "b",
          payeeName: "",
          transferAccountId: "savings",
          categoryId: null,
          memo: "",
          outflow: "20",
          inflow: "",
        },
      ],
    };
    const result = scheduleCreateBody(draft, settings, TODAY);
    expect(result.ok && result.body).toMatchObject({
      accountId: "checking",
      date: "2026-10-20",
      frequency: "weekly",
      amount: "-3000",
      today: TODAY,
      categoryId: null,
    });
    if (!result.ok) throw new Error(result.error);
    expect("cleared" in result.body).toBe(false);
    expect(result.body.subtransactions?.map((l) => "id" in l)).toEqual([false, false]);
  });
});

describe("scheduleUpdateBody", () => {
  it("sends the date and frequency only when they change (a new date restarts the repeats)", () => {
    const same = scheduleUpdateBody(row, draftFromScheduled(row, settings), settings, TODAY, true);
    expect(same.ok && same.body).toMatchObject({ amount: "-2500", payeeName: "Gym", memo: "m" });
    expect(same.ok && "date" in same.body).toBe(false);
    expect(same.ok && "frequency" in same.body).toBe(false);

    const moved = scheduleUpdateBody(
      row,
      { ...draftFromScheduled(row, settings), date: "2026-12-05", frequency: "weekly" },
      settings,
      TODAY,
      true,
    );
    expect(moved.ok && moved.body).toMatchObject({ date: "2026-12-05", frequency: "weekly" });
  });

  it("flips a transfer's other side back to the schedule's amount", () => {
    const draft = { ...draftFromScheduled(mirror, settings), inflow: "60" };
    const result = scheduleUpdateBody(mirror, draft, settings, TODAY, false);
    expect(result.ok && result.body).toEqual({
      today: TODAY,
      memo: "m",
      flag: "red",
      amount: "-6000",
    });
  });

  it("moves the schedule to the other side's account when its payee changes there", () => {
    const draft = {
      ...draftFromScheduled(mirror, settings),
      payeeName: "Bonus",
      transferAccountId: null,
    };
    const result = scheduleUpdateBody(mirror, draft, settings, TODAY, true);
    expect(result.ok && result.body).toMatchObject({
      accountId: "savings",
      amount: "5000",
      payeeName: "Bonus",
    });
  });
});

describe("scheduleRestoreBody", () => {
  it("puts the schedule back with its first date, so month-end repeats keep their day", () => {
    expect(scheduleRestoreBody(row)).toMatchObject({
      accountId: "checking",
      frequency: "monthly",
      date: "2026-11-30",
      dateFirst: "2026-10-31",
      payeeName: "Gym",
      categoryId: "c1",
      flag: "red",
    });
    expect(scheduleRestoreBody({ ...row, transferAccountId: "savings" })).toMatchObject({
      transferAccountId: "savings",
      payeeName: null,
    });
  });
});
