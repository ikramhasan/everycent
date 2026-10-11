import { transaction } from "@everycent/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBudget, createTestApp, resetDatabase, signUp } from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

type Txn = {
  id: string;
  accountId: string;
  cleared: string;
  flag: string | null;
  categoryId: string | null;
  payeeName: string | null;
  memo: string;
  transferAccountId: string | null;
  transferTransactionId: string | null;
  subtransactions: {
    id: string;
    categoryId: string | null;
    transferAccountId: string | null;
    transferTransactionId: string | null;
  }[];
};
type Category = { id: string; name: string };
type ErrorBody = { error: { code: string } };

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
    json<Record<string, number | string>>(
      await send("POST", `${base}/transactions/selection`, cookie, { selection }),
    );
  const all = async (accountId = checking.id) =>
    (
      await json<{ transactions: Txn[] }>(
        await send("GET", `${base}/transactions?accountId=${accountId}&limit=500`, cookie),
      )
    ).transactions;
  const updated = async (res: Response) => {
    expect(res.status, await res.clone().text()).toBe(200);
    return (await json<{ updated: number }>(res)).updated;
  };
  return {
    cookie,
    base,
    checking,
    addAccount,
    add,
    bulk,
    summary,
    all,
    updated,
    groceries,
    household,
  };
}

describe("bulk edit", () => {
  it("marks cleared, flags and categorizes ticked transactions", async () => {
    const { add, bulk, all, groceries } = await setup();
    const a = await add({ payeeName: "A" });
    const b = await add({ payeeName: "B" });
    const c = await add({ payeeName: "C" });
    const ids = [a.id, b.id];
    const first = await json<{ updated: number; before: Txn[] }>(
      await bulk({ ids }, { type: "cleared", cleared: "cleared" }),
    );
    expect(first.updated).toBe(2);
    expect(first.before).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: a.id, cleared: "uncleared" }),
        expect.objectContaining({ id: b.id, cleared: "uncleared" }),
      ]),
    );
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
    const filter = { accountId: checking.id, q: "Payee: costco" };
    const keep = costco[0]?.id ?? "";
    expect(await summary({ filter, exclude: [keep] })).toMatchObject({
      count: 119,
      total: "-29750",
    });
    const res = await bulk({ filter, exclude: [keep] }, { type: "flag", flag: "red" });
    expect((await json<{ updated: number }>(res)).updated).toBe(119);
    const rows = await all();
    expect(rows.filter((t) => t.flag === "red")).toHaveLength(119);
    expect(rows.find((t) => t.id === keep)?.flag).toBeNull();
    expect(rows.find((t) => t.payeeName === "Bakery")?.flag).toBeNull();
  });

  it("sums up what the action bar needs to know about the selection", async () => {
    const { addAccount, add, summary, groceries, household } = await setup();
    const savings = await addAccount("Savings", "savings");
    const plain = await add({ payeeName: "Plain", cleared: "cleared" });
    const split = await add({
      subtransactions: [
        { amount: "-40", categoryId: groceries.id },
        { amount: "-60", categoryId: household.id },
      ],
    });
    const transferSplit = await add({
      subtransactions: [
        { amount: "-40", categoryId: groceries.id },
        { amount: "-60", transferAccountId: savings.id },
      ],
    });
    const transfer = await add({ transferAccountId: savings.id });
    const otherSide = transferSplit.subtransactions[1]?.transferTransactionId ?? "";
    expect(
      await summary({ ids: [plain.id, split.id, transferSplit.id, transfer.id, otherSide] }),
    ).toEqual({
      count: 5,
      total: "-340",
      uncleared: 4,
      cleared: 1,
      reconciled: 0,
      reconciledTransfers: 0,
      categorizable: 3,
      splits: 2,
      splitsWithTransfers: 1,
      deletable: 4,
    });
  });

  it("categorizes as YNAB does: un-splits splits, keeps ones with transfers, skips the rest", async () => {
    const { addAccount, add, bulk, all, updated, groceries, household } = await setup();
    const savings = await addAccount("Savings", "savings");
    const house = await addAccount("House", "asset");
    const plain = await add({ payeeName: "Plain" });
    const split = await add({
      subtransactions: [
        { amount: "-40", categoryId: groceries.id },
        { amount: "-60", categoryId: household.id },
      ],
    });
    const transferSplit = await add({
      subtransactions: [
        { amount: "-40", categoryId: household.id },
        { amount: "-60", transferAccountId: savings.id },
      ],
    });
    const transfer = await add({ transferAccountId: savings.id });
    const tracking = (await all(house.id))[0];
    const n = await updated(
      await bulk(
        { ids: [plain.id, split.id, transferSplit.id, transfer.id, tracking?.id] },
        { type: "categorize", categoryId: groceries.id },
      ),
    );
    expect(n).toBe(3);
    const rows = await all();
    expect(rows.find((t) => t.id === plain.id)?.categoryId).toBe(groceries.id);
    expect(rows.find((t) => t.id === split.id)).toMatchObject({
      categoryId: groceries.id,
      subtransactions: [],
    });
    const kept = rows.find((t) => t.id === transferSplit.id);
    expect(kept?.categoryId).toBeNull();
    expect(kept?.subtransactions.map((l) => [l.categoryId, l.transferAccountId])).toEqual([
      [groceries.id, null],
      [null, savings.id],
    ]);
    expect(rows.find((t) => t.id === transfer.id)?.categoryId).toBeNull();
    expect((await all(house.id))[0]?.categoryId).toBeNull();
  });

  it("marks cleared, skipping reconciled transactions", async () => {
    const { add, bulk, all, updated } = await setup();
    const a = await add({});
    const b = await add({});
    await db.update(transaction).set({ cleared: "reconciled" }).where(eq(transaction.id, a.id));
    expect(
      await updated(await bulk({ ids: [a.id, b.id] }, { type: "cleared", cleared: "cleared" })),
    ).toBe(1);
    const rows = await all();
    expect(rows.find((t) => t.id === a.id)?.cleared).toBe("reconciled");
    expect(rows.find((t) => t.id === b.id)?.cleared).toBe("cleared");
  });

  it("moves and deletes transfers whose other side is reconciled, as YNAB does", async () => {
    // YNAB 2026-10-11 (x-tr-rec, x-split-rec): Move re-points the reconciled side with no
    // prompt; Delete asks first ("Delete Reconciled Transfer?") and then deletes both sides.
    const { addAccount, add, bulk, summary, all, updated, groceries } = await setup();
    const savings = await addAccount("Savings", "savings");
    const wallet = await addAccount("Wallet", "cash");
    const transfer = await add({ transferAccountId: savings.id });
    const split = await add({
      subtransactions: [
        { amount: "-40", categoryId: groceries.id },
        { amount: "-60", transferAccountId: savings.id },
      ],
    });
    const plain = await add({ payeeName: "Plain" });
    const sides = [
      transfer.transferTransactionId ?? "",
      split.subtransactions[1]?.transferTransactionId ?? "",
    ];
    for (const id of sides) {
      await db.update(transaction).set({ cleared: "reconciled" }).where(eq(transaction.id, id));
    }
    expect(await summary({ ids: [transfer.id, split.id, plain.id] })).toMatchObject({
      reconciled: 0,
      reconciledTransfers: 2,
    });

    expect(
      await updated(await bulk({ ids: [transfer.id] }, { type: "move", accountId: wallet.id })),
    ).toBe(1);
    const moved = (await all(wallet.id)).find((t) => t.id === transfer.id);
    expect(moved?.transferAccountId).toBe(savings.id);
    expect((await all(savings.id)).find((t) => t.id === sides[0])).toMatchObject({
      cleared: "reconciled",
      transferAccountId: wallet.id,
    });

    expect(await updated(await bulk({ ids: [transfer.id, split.id] }, { type: "delete" }))).toBe(2);
    expect((await all(savings.id)).map((t) => t.id)).not.toContain(sides[0]);
    expect((await all(savings.id)).map((t) => t.id)).not.toContain(sides[1]);
  });

  it("replaces the memo of every selected transaction", async () => {
    const { add, bulk, all, updated, groceries, household } = await setup();
    const a = await add({ memo: "old memo" });
    const split = await add({
      subtransactions: [
        { amount: "-40", categoryId: groceries.id, memo: "line" },
        { amount: "-60", categoryId: household.id },
      ],
    });
    expect(
      await updated(await bulk({ ids: [a.id, split.id] }, { type: "memo", memo: "bulk" })),
    ).toBe(2);
    const rows = await all();
    expect(rows.find((t) => t.id === a.id)?.memo).toBe("bulk");
    expect(rows.find((t) => t.id === split.id)?.memo).toBe("bulk");
    expect((await bulk({ ids: [a.id] }, { type: "memo", memo: "" })).status).toBe(400);
  });

  it("moves transactions; transfers keep their other side, which follows", async () => {
    const { checking, addAccount, add, bulk, all, updated, groceries } = await setup();
    const wallet = await addAccount("Wallet", "cash");
    const savings = await addAccount("Savings", "savings");
    const plain = await add({ payeeName: "Plain" });
    const toWallet = await add({ transferAccountId: wallet.id });
    const intoOwnSide = await add({ transferAccountId: savings.id });
    const n = await updated(
      await bulk(
        { ids: [plain.id, toWallet.id, intoOwnSide.id] },
        { type: "move", accountId: savings.id },
      ),
    );
    // The transfer to Savings can't move into Savings: skipped.
    expect(n).toBe(2);
    const inSavings = await all(savings.id);
    expect(inSavings.find((t) => t.id === plain.id)).toBeDefined();
    expect(inSavings.find((t) => t.id === toWallet.id)?.transferAccountId).toBe(wallet.id);
    const walletSide = (await all(wallet.id)).find((t) => t.id === toWallet.transferTransactionId);
    expect(walletSide?.transferAccountId).toBe(savings.id);
    expect((await all()).find((t) => t.id === intoOwnSide.id)).toBeDefined();

    // The other side of a split's transfer line moves too; the line then points at its account.
    const split = await add({
      subtransactions: [
        { amount: "-40", categoryId: groceries.id },
        { amount: "-60", transferAccountId: wallet.id },
      ],
    });
    const lineSide = split.subtransactions[1]?.transferTransactionId ?? "";
    expect(
      await updated(await bulk({ ids: [lineSide] }, { type: "move", accountId: savings.id })),
    ).toBe(1);
    const moved = (await all()).find((t) => t.id === split.id);
    expect(moved?.subtransactions[1]?.transferAccountId).toBe(savings.id);
    expect((await all(savings.id)).find((t) => t.id === lineSide)?.transferAccountId).toBe(
      checking.id,
    );
    // Not into the split's own account, nor a split into an account one of its lines goes to.
    expect(
      await updated(await bulk({ ids: [lineSide] }, { type: "move", accountId: checking.id })),
    ).toBe(0);
    expect(
      await updated(await bulk({ ids: [split.id] }, { type: "move", accountId: savings.id })),
    ).toBe(0);
  });

  it("deletes transactions with their transfers, but not a split's transfer side alone", async () => {
    const { addAccount, add, bulk, all, updated, groceries } = await setup();
    const savings = await addAccount("Savings", "savings");
    const plain = await add({ payeeName: "Plain" });
    const transfer = await add({ transferAccountId: savings.id });
    const split = await add({
      subtransactions: [
        { amount: "-40", categoryId: groceries.id },
        { amount: "-60", transferAccountId: savings.id },
      ],
    });
    const lineSide = split.subtransactions[1]?.transferTransactionId ?? "";
    expect(
      await updated(
        await bulk(
          { ids: [plain.id, transfer.transferTransactionId, lineSide] },
          { type: "delete" },
        ),
      ),
    ).toBe(2);
    const ids = (await all()).map((t) => t.id);
    expect(ids).not.toContain(plain.id);
    expect(ids).not.toContain(transfer.id);
    expect((await all(savings.id)).map((t) => t.id)).toContain(lineSide);
    // Deleting the split takes its transfer's other side with it.
    expect(await updated(await bulk({ ids: [split.id] }, { type: "delete" }))).toBe(1);
    expect((await all(savings.id)).map((t) => t.id)).not.toContain(lineSide);
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
    expect((await bulk({ ids: [a.id] }, { type: "archive" })).status).toBe(400);
    expect((await bulk({ ids: [] }, { type: "flag", flag: "red" })).status).toBe(400);
  });
});
