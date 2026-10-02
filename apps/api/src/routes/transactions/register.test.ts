import { transaction } from "@everycent/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBudget, createTestApp, resetDatabase, signUp } from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

type Txn = {
  id: string;
  date: string;
  amount: string;
  payeeName: string | null;
  memo: string;
  runningBalance: string;
  subtransactions: { id: string }[];
  matchingLineIds: string[] | null;
};
type Page = { transactions: Txn[]; nextCursor: string | null; someHidden: boolean | null };
type Category = { id: string; name: string };

function send(method: string, path: string, cookie: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const json = async <T>(res: Response) => (await res.json()) as T;

async function setup() {
  const { cookie } = await signUp(app);
  const budget = await createBudget(app, cookie);
  const base = `/v1/budgets/${budget.id}`;
  const account = await json<{ id: string }>(
    await send("POST", `${base}/accounts`, cookie, {
      name: "Checking",
      type: "checking",
      balance: "100000",
      date: "2026-01-01",
    }),
  );
  const { groups } = await json<{ groups: { kind: string | null; categories: Category[] }[] }>(
    await send("GET", `${base}/categories`, cookie),
  );
  const [groceries, household] = groups.filter((g) => !g.kind).flatMap((g) => g.categories);
  if (!groceries || !household) throw new Error("starter categories missing");
  const add = async (input: Record<string, unknown>) => {
    const res = await send("POST", `${base}/transactions`, cookie, {
      accountId: account.id,
      categoryId: null,
      ...input,
    });
    expect(res.status, await res.clone().text()).toBe(201);
    return json<Txn>(res);
  };
  const list = async (query: Record<string, string> = {}) => {
    const params = new URLSearchParams({ accountId: account.id, ...query });
    const res = await send("GET", `${base}/transactions?${params}`, cookie);
    expect(res.status, await res.clone().text()).toBe(200);
    return json<Page>(res);
  };
  return { base, cookie, account, add, list, groceries, household };
}

describe("register search, filters, sort and paging", () => {
  it("pages through the whole register without gaps or repeats", async () => {
    const { add, list } = await setup();
    // Same-day transactions too, so ties break by creation and id.
    for (let i = 1; i <= 7; i++) {
      await add({ date: `2026-02-0${Math.ceil(i / 2)}`, amount: `-${i}00`, payeeName: `P${i}` });
    }
    const all = await list({ limit: "100" });
    expect(all.nextCursor).toBeNull();
    const seen: Txn[] = [];
    let cursor: string | null | undefined;
    do {
      const page = await list({ limit: "3", ...(cursor ? { cursor } : {}) });
      expect(page.transactions.length).toBeLessThanOrEqual(3);
      seen.push(...page.transactions);
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen.map((t) => t.id)).toEqual(all.transactions.map((t) => t.id));
    expect(seen).toHaveLength(8); // and the starting balance
  });

  it("keeps the account's real running balance on filtered rows", async () => {
    const { add, list } = await setup();
    await add({ date: "2026-02-01", amount: "-1000", payeeName: "Costco" });
    await add({ date: "2026-02-02", amount: "-2000", payeeName: "Bakery" });
    await add({ date: "2026-02-03", amount: "-3000", payeeName: "Costco" });
    const { transactions } = await list({ q: "costco" });
    expect(transactions.map((t) => [t.date, t.runningBalance])).toEqual([
      ["2026-02-03", "94000"],
      ["2026-02-01", "99000"],
    ]);
  });

  it("searches payees, memos, split lines and amounts", async () => {
    const { add, list, groceries, household } = await setup();
    await add({ date: "2026-02-01", amount: "-4510", payeeName: "Market", memo: "eggs" });
    await add({ date: "2026-02-02", amount: "-999", payeeName: "100% Juice" });
    await add({
      date: "2026-02-03",
      amount: "-3000",
      payeeName: "Mall",
      subtransactions: [
        { amount: "-1000", categoryId: groceries.id, memo: "snacks" },
        { amount: "-2000", categoryId: household.id },
      ],
    });
    const payees = async (q: string) =>
      (await list({ q })).transactions.map((t) => t.payeeName).sort();
    expect(await payees("45.10")).toEqual(["Market"]);
    expect(await payees("45.1")).toEqual(["Market"]);
    expect(await payees("EGG")).toEqual(["Market"]);
    expect(await payees("snacks")).toEqual(["Mall"]);
    expect(await payees("10.00")).toEqual(["Mall"]);
    expect(await payees(household.name)).toEqual(["Mall"]);
    // `%` is literal, not a wildcard.
    expect(await payees("0%")).toEqual(["100% Juice"]);
  });

  it("filters with YNAB's search terms, all of which must match", async () => {
    const { base, cookie, add, list, groceries, household } = await setup();
    await send("PUT", `${base}/flags/blue`, cookie, { name: "Reimburse" });
    const a = await add({
      date: "2026-02-01",
      amount: "-100",
      payeeName: "Ann",
      categoryId: groceries.id,
      cleared: "cleared",
      flag: "red",
    });
    const b = await add({ date: "2026-03-01", amount: "-200", payeeName: "Bob", flag: "blue" });
    const split = await add({
      date: "2026-04-01",
      amount: "-300",
      payeeName: "Cid",
      subtransactions: [
        { amount: "-100", categoryId: household.id },
        { amount: "-200", categoryId: groceries.id, payeeName: "Ann" },
      ],
    });
    const income = await add({ date: "2026-04-02", amount: "5000", payeeName: "Work" });
    const ids = async (q: string, query: Record<string, string> = {}) =>
      (await list({ q, ...query })).transactions.map((t) => t.id);
    expect(await ids("", { from: "2026-02-15", to: "2026-03-31" })).toEqual([b.id]);
    expect(await ids("Is: Cleared")).toContain(a.id);
    expect(await ids("Is: Cleared")).not.toContain(b.id);
    expect(await ids("is: unreconciled")).toContain(b.id);
    expect(await ids("Flag: Red")).toEqual([a.id]);
    expect(await ids("Flag: reimburse")).toEqual([b.id]);
    expect(await ids("Flag: None")).not.toContain(a.id);
    expect(await ids(`Category: ${groceries.name}`)).toEqual([split.id, a.id]);
    expect(await ids("Category: Split")).toEqual([split.id]);
    expect(await ids("Payee: ann")).toEqual([split.id, a.id]);
    expect(await ids("Outflow: >=2")).toEqual([split.id, b.id]);
    expect(await ids("Outflow: 3")).toEqual([split.id]);
    expect(await ids("Inflow: <=50")).toEqual([income.id]);
    expect(await ids("Before: 03/01/2026, After: 03/01/2026")).toEqual([b.id]);
    expect(await ids("On: 02/01/2026")).toEqual([a.id]);
    // Every term must match the same transaction or the same split line.
    expect(await ids("Payee: Bob, Is: Cleared")).toEqual([]);
    expect(await ids("Payee: Ann, Outflow: 2")).toEqual([split.id]);
  });

  it("shows only the split lines a search matches", async () => {
    const { add, list, groceries, household } = await setup();
    const split = await add({
      date: "2026-02-01",
      amount: "-300",
      payeeName: "Store",
      memo: "weekly",
      subtransactions: [
        { amount: "-100", categoryId: household.id },
        { amount: "-200", categoryId: groceries.id, payeeName: "Other" },
      ],
    });
    const [householdLine, groceriesLine] = split.subtransactions;
    const row = async (q: string) =>
      (await list({ q })).transactions.find((t) => t.id === split.id);
    // A line without its own payee has the split's.
    expect((await row("Payee: store"))?.matchingLineIds).toEqual([householdLine?.id]);
    expect((await row(`Category: ${groceries.name}`))?.matchingLineIds).toEqual([
      groceriesLine?.id,
    ]);
    // The split itself matches, none of its lines do.
    expect((await row("Outflow: 3"))?.matchingLineIds).toEqual([]);
    expect((await row("weekly"))?.matchingLineIds).toEqual([]);
    expect((await list()).transactions[0]?.matchingLineIds).toBeNull();
  });

  it("hides reconciled transactions and says when anything is hidden", async () => {
    const { add, list } = await setup();
    // The starting balance is cleared; reconcile it straight in the database.
    const { transactions } = await list();
    const start = transactions[0];
    if (!start) throw new Error("no starting balance");
    await db.update(transaction).set({ cleared: "reconciled" }).where(eq(transaction.id, start.id));
    const shop = await add({ date: "2026-02-01", amount: "-100", payeeName: "Shop" });
    expect((await list()).someHidden).toBe(false);
    const hidden = await list({ hideReconciled: "true" });
    expect(hidden.transactions.map((t) => t.id)).toEqual([shop.id]);
    expect(hidden.someHidden).toBe(true);
    expect((await list({ q: "nothing like it" })).someHidden).toBe(true);
    expect((await list({ q: "Shop", from: "2026-01-01" })).someHidden).toBe(true);
    expect((await list({ limit: "1" })).someHidden).toBe(false);
  });

  it("puts a day's largest outflow on top, and runs the balance from the bottom", async () => {
    const { add, list } = await setup();
    await add({ date: "2026-02-01", amount: "-100", payeeName: "Small" });
    await add({ date: "2026-02-01", amount: "500", payeeName: "Refund" });
    await add({ date: "2026-02-01", amount: "-900", payeeName: "Big" });
    const { transactions } = await list();
    expect(transactions.map((t) => [t.payeeName, t.runningBalance])).toEqual([
      ["Big", "99500"],
      ["Small", "100400"],
      ["Refund", "100500"],
      ["Starting Balance", "100000"],
    ]);
  });

  it("sorts by any column, both ways, and pages in that order", async () => {
    const { add, list } = await setup();
    await add({ date: "2026-02-01", amount: "-300", payeeName: "banana" });
    await add({ date: "2026-02-02", amount: "-100", payeeName: "Apple" });
    await add({ date: "2026-02-03", amount: "-200", payeeName: "cherry" });
    const payees = async (query: Record<string, string>) =>
      (await list(query)).transactions.map((t) => t.payeeName);
    // Case-insensitive, as people read names.
    expect(await payees({ sort: "payee", dir: "asc" })).toEqual([
      "Apple",
      "banana",
      "cherry",
      "Starting Balance",
    ]);
    expect(await payees({ sort: "amount", dir: "asc" })).toEqual([
      "banana",
      "cherry",
      "Apple",
      "Starting Balance",
    ]);
    const first = await list({ sort: "payee", dir: "desc", limit: "2" });
    const rest = await list({
      sort: "payee",
      dir: "desc",
      limit: "10",
      cursor: first.nextCursor ?? "",
    });
    expect([...first.transactions, ...rest.transactions].map((t) => t.payeeName)).toEqual([
      "Starting Balance",
      "cherry",
      "banana",
      "Apple",
    ]);
  });

  it("rejects a cursor from another sort", async () => {
    const { base, cookie, account, add, list } = await setup();
    await add({ date: "2026-02-01", amount: "-100" });
    const { nextCursor } = await list({ limit: "1" });
    const res = await send(
      "GET",
      `${base}/transactions?accountId=${account.id}&sort=payee&cursor=${nextCursor}`,
      cookie,
    );
    expect(res.status).toBe(400);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe("INVALID_CURSOR");
    const junk = await send("GET", `${base}/transactions?cursor=nope`, cookie);
    expect(junk.status).toBe(400);
  });
});
