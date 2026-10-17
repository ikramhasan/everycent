import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createBudget,
  createTestApp,
  resetDatabase,
  shareBudget,
  signUp,
} from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

type Txn = {
  id: string;
  date: string;
  amount: string;
  payeeId: string | null;
  payeeName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  memo: string;
  cleared: string;
  approved: boolean;
};
type Result = { imported: number; duplicates: number; transactionIds: string[] };

function send(method: string, path: string, cookie: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const json = async <T>(res: Response) => (await res.json()) as T;

async function setup() {
  const owner = await signUp(app);
  const budget = await createBudget(app, owner.cookie);
  const base = `/v1/budgets/${budget.id}`;
  const addAccount = async (name: string, type = "checking") =>
    json<{ id: string }>(
      await send("POST", `${base}/accounts`, owner.cookie, {
        name,
        type,
        balance: "0",
        date: "2026-10-01",
      }),
    );
  const checking = await addAccount("Checking");
  const importFile = async (
    rows: unknown[],
    extra: Record<string, unknown> = {},
    accountId = checking.id,
  ) => {
    const res = await send(
      "POST",
      `${base}/accounts/${accountId}/import?today=2026-10-17`,
      owner.cookie,
      {
        transactions: rows,
        ...extra,
      },
    );
    expect(res.status, await res.clone().text()).toBe(200);
    return json<Result>(res);
  };
  const rows = async (accountId = checking.id) =>
    (
      await json<{ transactions: Txn[] }>(
        await send("GET", `${base}/transactions?accountId=${accountId}&limit=500`, owner.cookie),
      )
    ).transactions.filter((t) => t.payeeName !== "Starting Balance");
  const { groups } = await json<{
    groups: { kind: string | null; categories: { id: string; name: string }[] }[];
  }>(await send("GET", `${base}/categories`, owner.cookie));
  const groceries = groups.filter((g) => !g.kind).flatMap((g) => g.categories)[3];
  if (!groceries) throw new Error("starter categories missing");
  return { owner, budget, base, checking, addAccount, importFile, rows, groceries };
}

const coffee = { date: "2026-10-10", amount: "-450", payee: "x Coffee Shop", memo: "latte" };
const pay = { date: "2026-10-11", amount: "120000", payee: "x Employer", memo: "paycheck" };
const zero = { date: "2026-10-12", amount: "0", payee: "x Zero", memo: "" };

describe("file import (EVERYCENT-66)", () => {
  it("adds rows cleared and unapproved, keeping memos and $0 rows", async () => {
    const { importFile, rows, base, owner } = await setup();
    const result = await importFile([coffee, pay, zero]);
    expect(result).toMatchObject({ imported: 3, duplicates: 0 });
    const list = await rows();
    expect(list.map((t) => [t.date, t.amount, t.payeeName, t.memo, t.cleared, t.approved])).toEqual(
      [
        ["2026-10-12", "0", "x Zero", "", "cleared", false],
        ["2026-10-11", "120000", "x Employer", "paycheck", "cleared", false],
        ["2026-10-10", "-450", "x Coffee Shop", "latte", "cleared", false],
      ],
    );
    // An inflow from a new payee goes to Ready to Assign; outflows stay Uncategorized.
    expect(list.map((t) => t.categoryName)).toEqual([
      "Uncategorized",
      "Inflow: Ready to Assign",
      "Uncategorized",
    ]);
    const accounts = await json<{ accounts: { name: string; toReview: number }[] }>(
      await send("GET", `${base}/accounts`, owner.cookie),
    );
    expect(accounts.accounts.find((a) => a.name === "Checking")?.toReview).toBe(3);
  });

  it("skips rows imported before, even after they're deleted", async () => {
    const { importFile, rows, base, owner } = await setup();
    await importFile([coffee, coffee, pay]);
    expect(await importFile([coffee, coffee, pay])).toMatchObject({ imported: 0, duplicates: 3 });
    // A third coffee that day is a new row (the file's third occurrence).
    expect(await importFile([coffee, coffee, coffee])).toMatchObject({
      imported: 1,
      duplicates: 2,
    });
    const [first] = await rows();
    if (!first) throw new Error("no rows");
    expect((await send("DELETE", `${base}/transactions/${first.id}`, owner.cookie)).status).toBe(
      204,
    );
    expect(await importFile([coffee, coffee, coffee, pay])).toMatchObject({
      imported: 0,
      duplicates: 4,
    });
    expect(await rows()).toHaveLength(3);
  });

  it("keeps each account's import ids to itself", async () => {
    const { importFile, addAccount } = await setup();
    const savings = await addAccount("Savings", "savings");
    await importFile([coffee]);
    expect(await importFile([coffee], {}, savings.id)).toMatchObject({ imported: 1 });
  });

  it("renames payees by the plan's rules and uses the payee's usual category (EVERYCENT-174)", async () => {
    const { importFile, rows, base, owner, checking, groceries } = await setup();
    // A payee with a rule and a categorized history.
    const res = await send("POST", `${base}/transactions`, owner.cookie, {
      accountId: checking.id,
      date: "2026-10-02",
      amount: "-100",
      payeeName: "Market",
      categoryId: groceries.id,
      memo: "",
      flag: null,
    });
    const market = (await json<Txn>(res)).payeeId;
    await send("POST", `${base}/payees/${market}/rules`, owner.cookie, {
      operator: "contains",
      text: "MKT",
    });
    await importFile([{ date: "2026-10-12", amount: "-2500", payee: "POS MKT #123", memo: "" }]);
    const [row] = await rows();
    expect(row).toMatchObject({ payeeName: "Market", categoryId: groceries.id, approved: false });
  });

  it("refuses rows dated after today and closed accounts", async () => {
    const { base, owner, checking } = await setup();
    const future = await send(
      "POST",
      `${base}/accounts/${checking.id}/import?today=2026-10-17`,
      owner.cookie,
      {
        transactions: [{ ...coffee, date: "2026-10-18" }],
      },
    );
    expect(future.status).toBe(400);
    expect((await json<{ error: { code: string } }>(future)).error.code).toBe("DATE_IN_FUTURE");
  });

  it("remembers the CSV settings and reports the start date and last reconciliation", async () => {
    const { importFile, base, owner, checking } = await setup();
    const settings = {
      columns: ["date", "description", "memo", "amount"],
      mapping: { date: 0, payee: 1, memo: 2, outflow: 3, inflow: 3 },
      noHeaderRow: false,
      swapInflowOutflow: false,
      dateFormat: "MM/DD/YYYY",
    };
    const context = async () =>
      json<{
        startDate: string | null;
        reconciledThrough: string | null;
        csvSettings: unknown;
        statementSettings: unknown;
      }>(await send("GET", `${base}/accounts/${checking.id}/import-context`, owner.cookie));
    expect(await context()).toEqual({
      startDate: "2026-10-01",
      reconciledThrough: null,
      csvSettings: null,
      statementSettings: null,
    });
    await importFile([coffee], { csvSettings: settings });
    expect(await context()).toMatchObject({ startDate: "2026-10-01", csvSettings: settings });
    await importFile([{ ...pay, date: "2026-09-20" }]);
    expect((await context()).startDate).toBe("2026-09-20");
    // Left out keeps them; null forgets them.
    expect((await context()).csvSettings).toEqual(settings);
    await importFile([], { csvSettings: null });
    expect((await context()).csvSettings).toBeNull();
    // OFX/QIF options are kept apart (EVERYCENT-67).
    const statement = { importMemos: false, swapPayeeMemo: true, swapInflowOutflow: false };
    await importFile([], { statementSettings: statement });
    expect(await context()).toMatchObject({ csvSettings: null, statementSettings: statement });
  });

  it("lets editors import and refuses viewers", async () => {
    const { budget, base, owner, checking } = await setup();
    const viewer = await shareBudget(app, owner.cookie, budget.id, { role: "viewer" });
    const res = await send("POST", `${base}/accounts/${checking.id}/import`, viewer.cookie, {
      transactions: [coffee],
    });
    expect(res.status).toBe(403);
    const stranger = await signUp(app);
    expect(
      (await send("GET", `${base}/accounts/${checking.id}/import-context`, stranger.cookie)).status,
    ).toBe(404);
  });
});
