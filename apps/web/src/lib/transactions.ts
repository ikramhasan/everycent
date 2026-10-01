import type { components } from "@everycent/api-client";
import { $api } from "./api";
import type { CategoryList } from "./categories";
import { type MoneySettings, parseMoneyInput, toMoneyInput } from "./money-input";

export type Transaction = components["schemas"]["Transaction"];
export type Payee = components["schemas"]["Payee"];
type CreateBody = components["schemas"]["CreateTransaction"];
type UpdateBody = components["schemas"]["UpdateTransaction"];

/** One account's register, or every account's when `accountId` is left out. */
export const transactionsQueryOptions = (budgetId: string, accountId?: string) =>
  $api.queryOptions("get", "/v1/budgets/{budgetId}/transactions", {
    params: { path: { budgetId }, query: accountId ? { accountId } : {} },
  });

/** Prefix that matches every register query (any budget, any account). */
export const transactionsQueryPrefix = ["get", "/v1/budgets/{budgetId}/transactions"] as const;

export const payeesQueryOptions = (budgetId: string) =>
  $api.queryOptions("get", "/v1/budgets/{budgetId}/payees", {
    params: { path: { budgetId } },
  });

export interface CategoryOption {
  id: string;
  name: string;
  group: string;
}

/**
 * The categories a transaction can be filed under, as YNAB lists them: "Ready to Assign" for
 * income first, then the visible groups and categories. Payment categories only get money by
 * assigning, so they're left out.
 */
export function categoryOptions(list: CategoryList): CategoryOption[] {
  return [
    { id: list.readyToAssignCategoryId, name: "Ready to Assign", group: "Inflow" },
    ...list.groups
      .filter((g) => !g.kind && !g.hidden)
      .flatMap((g) =>
        g.categories
          .filter((c) => !c.hidden)
          .map((c) => ({ id: c.id, name: c.name, group: g.name })),
      ),
  ];
}

/** What the register shows for a category: income reads like YNAB's "Inflow: Ready to Assign". */
export function categoryLabel(option: CategoryOption) {
  return option.group === "Inflow" ? `Inflow: ${option.name}` : option.name;
}

/** The fields of the inline editor, as typed. */
export interface Draft {
  accountId: string;
  date: string;
  payeeName: string;
  categoryId: string | null;
  memo: string;
  outflow: string;
  inflow: string;
  cleared: "uncleared" | "cleared";
}

export function emptyDraft(accountId: string, date: string): Draft {
  return {
    accountId,
    date,
    payeeName: "",
    categoryId: null,
    memo: "",
    outflow: "",
    inflow: "",
    cleared: "uncleared",
  };
}

export function draftFrom(t: Transaction, settings: MoneySettings): Draft {
  const amount = BigInt(t.amount);
  return {
    accountId: t.accountId,
    date: t.date,
    payeeName: t.payeeName ?? "",
    categoryId: t.categoryId,
    memo: t.memo,
    outflow: amount < 0n ? toMoneyInput(-amount, settings) : "",
    inflow: amount > 0n ? toMoneyInput(amount, settings) : "",
    cleared: t.cleared === "uncleared" ? "uncleared" : "cleared",
  };
}

/** Inflow minus outflow, in minor units; empty fields count as zero. */
export function draftAmount(draft: Draft, settings: MoneySettings): bigint | string {
  const parse = (text: string) => (text.trim() === "" ? 0n : parseMoneyInput(text, settings));
  const outflow = parse(draft.outflow);
  if (typeof outflow === "string") return outflow;
  const inflow = parse(draft.inflow);
  if (typeof inflow === "string") return inflow;
  return inflow - outflow;
}

type Result<T> = { ok: true; body: T } | { ok: false; error: string };

export function createBody(draft: Draft, settings: MoneySettings): Result<CreateBody> {
  const amount = draftAmount(draft, settings);
  if (typeof amount === "string") return { ok: false, error: amount };
  return {
    ok: true,
    body: {
      accountId: draft.accountId,
      date: draft.date,
      amount: amount.toString(),
      payeeName: draft.payeeName.trim() || null,
      categoryId: draft.categoryId,
      memo: draft.memo,
      cleared: draft.cleared,
    },
  };
}

/**
 * Only what changed, so untouched fields keep server-side meaning (e.g. a credit card's starting
 * debt stays uncategorized).
 */
export function updateBody(
  original: Transaction,
  draft: Draft,
  settings: MoneySettings,
): Result<UpdateBody> {
  const amount = draftAmount(draft, settings);
  if (typeof amount === "string") return { ok: false, error: amount };
  const before = draftFrom(original, settings);
  const body: UpdateBody = {};
  if (draft.accountId !== before.accountId) body.accountId = draft.accountId;
  if (draft.date !== before.date) body.date = draft.date;
  if (amount.toString() !== original.amount) body.amount = amount.toString();
  if (draft.payeeName.trim() !== before.payeeName) body.payeeName = draft.payeeName.trim() || null;
  if (draft.categoryId !== before.categoryId) body.categoryId = draft.categoryId;
  if (draft.memo !== before.memo) body.memo = draft.memo;
  if (draft.cleared !== before.cleared) body.cleared = draft.cleared;
  return { ok: true, body };
}

/** The cells YNAB lets you edit in place on an existing transaction. */
export type CellColumn = "account" | "date" | "payee" | "category" | "memo" | "outflow" | "inflow";

/** A cell's starting text (or id, for account and category). */
export function cellValue(t: Transaction, column: CellColumn, settings: MoneySettings) {
  const draft = draftFrom(t, settings);
  switch (column) {
    case "account":
      return t.accountId;
    case "payee":
      return draft.payeeName;
    case "category":
      return t.categoryId;
    default:
      return draft[column];
  }
}

/**
 * What to send after editing one cell; an empty body means nothing changed. Typing an outflow
 * makes it an outflow (and an inflow an inflow); emptying the amount's own side makes it zero.
 */
export function cellUpdate(
  t: Transaction,
  column: CellColumn,
  value: string | null,
  settings: MoneySettings,
): Result<UpdateBody> {
  if (column === "outflow" || column === "inflow") {
    const text = value ?? "";
    let amount: bigint;
    if (text.trim() === "") {
      const current = BigInt(t.amount);
      const ownSide = column === "outflow" ? current < 0n : current > 0n;
      amount = ownSide ? 0n : current;
    } else {
      const parsed = parseMoneyInput(text, settings);
      if (typeof parsed === "string") return { ok: false, error: parsed };
      amount = column === "outflow" ? -parsed : parsed;
    }
    return { ok: true, body: amount.toString() === t.amount ? {} : { amount: amount.toString() } };
  }
  if (value === cellValue(t, column, settings)) return { ok: true, body: {} };
  switch (column) {
    case "account":
      return value ? { ok: true, body: { accountId: value } } : { ok: true, body: {} };
    case "date":
      return value ? { ok: true, body: { date: value } } : { ok: false, error: "Enter a date." };
    case "payee":
      return { ok: true, body: { payeeName: value?.trim() || null } };
    case "category":
      return { ok: true, body: { categoryId: value } };
    case "memo":
      return { ok: true, body: { memo: value ?? "" } };
  }
}
