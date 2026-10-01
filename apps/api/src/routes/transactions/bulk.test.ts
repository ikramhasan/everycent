import { transaction } from "@everycent/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBudget, createTestApp, resetDatabase, signUp } from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

type Txn = {
  id: string;
  cleared: string;
  flag: string | null;
  categoryId: string | null;
  payeeName: string | null;
};
type Category = { id: string; name: string };
type ErrorBody = { error: { code: string; details?: Record<string, number> } };

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
  const addAccount = async (name: string, type: string) =>
    json<{ id: string }>(
      await send("POST", `${base}/accounts`, cookie, {
        name,
        type,
        balance: "0",
        date: "2026-01-01",
      }),
    );
  const checking = await addAccount("Checking", "checking");
  const { groups } = await json<{ groups: { kind: string | null; categories: Category[] }[] }>(
    await send("GET", `${base}/categories`, cookie),
  );
  const [groceries, household] = groups.filter((g) => !g.kind).flatMap((g) => g.categories);
  if (!groceries || !household) throw new Error("starter categories missing");
  const add = async (input: Record<string, unknown>) =>
    json<Txn>(
      await send("POST", `${base}/transactions`, cookie, {
        accountId: checking.id,
        date: "2026-02-01",
        amount: "-100",
        categoryId: null,
        ...input,
      }),
    );
  const bulk = (selection: unknown, action: unknown) =>
    send("POST", `${base}/transactions/bulk`, cookie, { selection, action });
  const summary = async (selection: unknown) =>
    json<{ count: number; total: string }>(
      await send("POST", `${base}/transactions/selection`, cookie, { selection }),
    );
  const all = async () =>
    (
      await json<{ transactions: Txn[] }>(
        await send("GET", `${base}/transactions?accountId=${checking.id}&limit=500`, cookie),
      )
    ).transactions;
  return { cookie, base, checking, addAccount, add, bulk, summary, all, groceries, household };
}

describe("bulk edit", () => {
  it("marks cleared, flags and categorizes ticked transactions", async () => {
    const { add, bulk, all, groceries } = await setup();
    const a = await add({ payeeName: "A" });
    const b = await add({ payeeName: "B" });
    const c = await add({ payeeName: "C" });
    const ids = [a.id, b.id];
    expect(
      (
        await json<{ updated: number }>(
          await bulk({ ids }, { type: "cleared", cleared: "cleared" }),
        )
      ).updated,
    ).toBe(2);
    await bulk({ ids }, { type: "flag", flag: "green" });
    await bulk({ ids }, { type: "categorize", categoryId: groceries.id });
    const rows = await all();
    for (const id of ids) {
      expect(rows.find((t) => t.id === id)).toMatchObject({
        cleared: "cleared",
        flag: "green",
        categoryId: groceries.id,
      });
    }
    expect(rows.find((t) => t.id === c.id)).toMatchObject({ cleared: "uncleared", flag: null });

    await bulk({ ids }, { type: "flag", flag: null });
    expect((await all()).find((t) => t.id === a.id)?.flag).toBeNull();
  });

  it("selects everything a filter matches, minus unticked rows, without paging", async () => {
    const { checking, add, bulk, summary, all } = await setup();
    const costco: Txn[] = [];
    for (let i = 0; i < 120; i++) costco.push(await add({ payeeName: "Costco", amount: "-250" }));
    await add({ payeeName: "Bakery" });
    const filter = { accountId: checking.id, q: "costco" };
    const keep = costco[0]?.id ?? "";
    expect(await summary({ filter, exclude: [keep] })).toEqual({ count: 119, total: "-29750" });
    const res = await bulk({ filter, exclude: [keep] }, { type: "flag", flag: "red" });
    expect((await json<{ updated: number }>(res)).updated).toBe(119);
    const rows = await all();
    expect(rows.filter((t) => t.flag === "red")).toHaveLength(119);
    expect(rows.find((t) => t.id === keep)?.flag).toBeNull();
    expect(rows.find((t) => t.payeeName === "Bakery")?.flag).toBeNull();
  });

  it("changes nothing when part of the selection can't take the action", async () => {
    const { checking, addAccount, add, bulk, all, groceries, household } = await setup();
    const savings = await addAccount("Savings", "savings");
    const plain = await add({ payeeName: "Plain" });
    const split = await add({
      payeeName: "Split",
      subtransactions: [
        { amount: "-40", categoryId: groceries.id },
        { amount: "-60", categoryId: household.id },
      ],
    });
    const transfer = await add({ transferAccountId: savings.id });
    const res = await bulk(
      { ids: [plain.id, split.id, transfer.id] },
      { type: "categorize", categoryId: groceries.id },
    );
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.error.code).toBe("BULK_NOT_ALLOWED");
    expect(body.error.details).toEqual({ splits: 1, noCategory: 1 });
    expect((await all()).find((t) => t.id === plain.id)?.categoryId).not.toBe(groceries.id);

    await db.update(transaction).set({ cleared: "reconciled" }).where(eq(transaction.id, plain.id));
    const reconciled = await bulk(
      { filter: { accountId: checking.id } },
      { type: "cleared", cleared: "uncleared" },
    );
    expect((await json<ErrorBody>(reconciled)).error.details).toEqual({ reconciled: 1 });
  });

  it("only touches the caller's budget, and needs edit rights", async () => {
    const { add, bulk, all } = await setup();
    const mine = await add({ payeeName: "Mine" });
    const other = await setup();
    const theirs = await other.add({ payeeName: "Theirs" });
    // Someone else's id in my selection is simply not selected.
    const res = await bulk({ ids: [mine.id, theirs.id] }, { type: "flag", flag: "blue" });
    expect((await json<{ updated: number }>(res)).updated).toBe(1);
    expect((await other.all()).find((t) => t.id === theirs.id)?.flag).toBeNull();
    expect((await all()).find((t) => t.id === mine.id)?.flag).toBe("blue");

    const stranger = await signUp(app);
    const outsider = await send("POST", `${other.base}/transactions/bulk`, stranger.cookie, {
      selection: { ids: [theirs.id] },
      action: { type: "flag", flag: "red" },
    });
    expect(outsider.status).toBe(404);
  });

  it("refuses payment categories and unknown actions", async () => {
    const { add, addAccount, bulk, base, cookie } = await setup();
    const a = await add({});
    await addAccount("Visa", "credit_card");
    const { groups } = await json<{
      groups: { kind: string | null; categories: Category[] }[];
    }>(await send("GET", `${base}/categories`, cookie));
    const payment = groups.find((g) => g.kind)?.categories[0];
    const res = await bulk({ ids: [a.id] }, { type: "categorize", categoryId: payment?.id });
    expect((await json<ErrorBody>(res)).error.code).toBe("CATEGORY_NOT_ALLOWED");
    expect((await bulk({ ids: [a.id] }, { type: "delete" })).status).toBe(400);
    expect((await bulk({ ids: [] }, { type: "flag", flag: "red" })).status).toBe(400);
  });
});
