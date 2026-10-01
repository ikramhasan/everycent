import { transaction } from "@everycent/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBudget, createTestApp, resetDatabase, signUp } from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

type Account = { id: string; name: string; balances: { working: string } };
type Txn = {
  id: string;
  accountId: string;
  date: string;
  amount: string;
  payeeName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  memo: string;
  cleared: string;
  transferAccountId: string | null;
  transferTransactionId: string | null;
};
type Category = { id: string; name: string };
type Group = { kind: string | null; categories: Category[] };
type ErrorBody = { error: { code: string } };

const TODAY = "2026-10-01";

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
  const addAccount = async (name: string, type: string, balance = "0") =>
    json<Account>(
      await send("POST", `${base}/accounts`, cookie, { name, type, balance, date: TODAY }),
    );
  const groups = (await json<{ groups: Group[] }>(await send("GET", `${base}/categories`, cookie)))
    .groups;
  const [groceries] = groups.filter((g) => !g.kind).flatMap((g) => g.categories);
  if (!groceries) throw new Error("starter categories missing");

  const post = (input: Record<string, unknown>) =>
    send("POST", `${base}/transactions`, cookie, { date: TODAY, categoryId: null, ...input });
  const transfer = async (from: Account, to: Account, amount: string, extra = {}) => {
    const res = await post({ accountId: from.id, transferAccountId: to.id, amount, ...extra });
    expect(res.status, await res.clone().text()).toBe(201);
    return json<Txn>(res);
  };
  const patch = (id: string, body: Record<string, unknown>) =>
    send("PATCH", `${base}/transactions/${id}`, cookie, body);
  const register = async (accountId?: string) =>
    (
      await json<{ transactions: Txn[] }>(
        await send(
          "GET",
          `${base}/transactions${accountId ? `?accountId=${accountId}` : ""}`,
          cookie,
        ),
      )
    ).transactions;
  const find = async (id: string) => (await register()).find((t) => t.id === id);
  const working = async (accountId: string) => {
    const { accounts } = await json<{ accounts: Account[] }>(
      await send("GET", `${base}/accounts?today=${TODAY}`, cookie),
    );
    return accounts.find((a) => a.id === accountId)?.balances.working;
  };
  return { cookie, base, addAccount, post, transfer, patch, register, find, working, groceries };
}

describe("transfers", () => {
  it("creates both sides with opposite amounts and transfer payees", async () => {
    const { addAccount, transfer, find, working } = await setup();
    const checking = await addAccount("Checking", "checking", "100000");
    const savings = await addAccount("Savings", "savings");

    const out = await transfer(checking, savings, "-25000", { memo: "rainy day" });
    expect(out).toMatchObject({
      accountId: checking.id,
      amount: "-25000",
      payeeName: "Transfer : Savings",
      transferAccountId: savings.id,
      categoryId: null,
      memo: "rainy day",
    });
    const other = await find(out.transferTransactionId ?? "");
    expect(other).toMatchObject({
      accountId: savings.id,
      amount: "25000",
      payeeName: "Transfer : Checking",
      transferAccountId: checking.id,
      transferTransactionId: out.id,
      categoryId: null,
      memo: "rainy day",
      cleared: "uncleared",
    });
    expect(await working(checking.id)).toBe("75000");
    expect(await working(savings.id)).toBe("25000");
  });

  it("categorizes only the budget side of a transfer to a tracking account", async () => {
    const { addAccount, post, transfer, find, groceries } = await setup();
    const checking = await addAccount("Checking", "checking", "100000");
    const savings = await addAccount("Savings", "savings");
    const brokerage = await addAccount("Brokerage", "asset");
    const house = await addAccount("House", "asset");

    const invest = await transfer(checking, brokerage, "-5000", { categoryId: groceries.id });
    expect(invest.categoryId).toBe(groceries.id);
    expect((await find(invest.transferTransactionId ?? ""))?.categoryId).toBeNull();

    // Coming back from tracking: the budget side defaults to Uncategorized.
    const back = await transfer(brokerage, checking, "-1000");
    expect(back.categoryId).toBeNull();
    expect((await find(back.transferTransactionId ?? ""))?.categoryName).toBe("Uncategorized");

    const tracked = await transfer(brokerage, house, "-1000");
    expect(tracked.categoryId).toBeNull();
    expect((await find(tracked.transferTransactionId ?? ""))?.categoryId).toBeNull();

    const res = await post({
      accountId: checking.id,
      transferAccountId: savings.id,
      amount: "-1",
      categoryId: groceries.id,
    });
    expect(res.status).toBe(400);
    expect((await json<ErrorBody>(res)).error.code).toBe("CATEGORY_NOT_ALLOWED");
  });

  it("rejects transfers to the same account, to closed accounts, or with a payee name", async () => {
    const { base, cookie, addAccount, post } = await setup();
    const checking = await addAccount("Checking", "checking");
    const savings = await addAccount("Savings", "savings");
    const old = await addAccount("Old", "savings");
    await send("POST", `${base}/accounts/${old.id}/close`, cookie, { date: TODAY });

    const self = await post({
      accountId: checking.id,
      transferAccountId: checking.id,
      amount: "1",
    });
    expect((await json<ErrorBody>(self)).error.code).toBe("TRANSFER_SAME_ACCOUNT");
    const closed = await post({ accountId: checking.id, transferAccountId: old.id, amount: "1" });
    expect((await json<ErrorBody>(closed)).error.code).toBe("ACCOUNT_CLOSED");
    const both = await post({
      accountId: checking.id,
      transferAccountId: savings.id,
      payeeName: "Bank",
      amount: "1",
    });
    expect(both.status).toBe(400);
  });

  it("syncs date and amount to the other side, keeps memo and cleared per side", async () => {
    const { addAccount, transfer, patch, find } = await setup();
    const checking = await addAccount("Checking", "checking", "100000");
    const savings = await addAccount("Savings", "savings");
    const out = await transfer(checking, savings, "-25000");
    const otherId = out.transferTransactionId ?? "";

    await patch(otherId, { amount: "30000", date: "2026-10-03", memo: "mine", cleared: "cleared" });
    expect(await find(out.id)).toMatchObject({
      amount: "-30000",
      date: "2026-10-03",
      memo: "",
      cleared: "uncleared",
    });
    expect(await find(otherId)).toMatchObject({ memo: "mine", cleared: "cleared" });
  });

  it("moves the other side when the transfer account changes, and follows a moved side", async () => {
    const { addAccount, transfer, patch, find, groceries } = await setup();
    const checking = await addAccount("Checking", "checking", "100000");
    const savings = await addAccount("Savings", "savings");
    const cash = await addAccount("Wallet", "cash");
    const brokerage = await addAccount("Brokerage", "asset");
    const out = await transfer(checking, savings, "-2000");
    const otherId = out.transferTransactionId ?? "";

    const retargeted = await json<Txn>(await patch(out.id, { transferAccountId: brokerage.id }));
    expect(retargeted).toMatchObject({
      payeeName: "Transfer : Brokerage",
      transferTransactionId: otherId,
      categoryName: "Uncategorized",
    });
    expect(await find(otherId)).toMatchObject({ accountId: brokerage.id, amount: "2000" });

    await patch(out.id, { categoryId: groceries.id });
    // Moving the budget side to another budget account keeps its category (the money still
    // leaves the budget for Brokerage); the other side's payee follows.
    const moved = await json<Txn>(await patch(out.id, { accountId: cash.id }));
    expect(moved).toMatchObject({ accountId: cash.id, categoryId: groceries.id });
    expect((await find(otherId))?.payeeName).toBe("Transfer : Wallet");

    // Back to a budget-to-budget transfer: no category on either side.
    const inBudget = await json<Txn>(await patch(out.id, { transferAccountId: savings.id }));
    expect(inBudget.categoryId).toBeNull();
    expect(await find(otherId)).toMatchObject({ accountId: savings.id, categoryId: null });

    const self = await patch(out.id, { transferAccountId: cash.id });
    expect((await json<ErrorBody>(self)).error.code).toBe("TRANSFER_SAME_ACCOUNT");
  });

  it("turns a normal transaction into a transfer and back", async () => {
    const { addAccount, post, patch, find, register } = await setup();
    const checking = await addAccount("Checking", "checking", "100000");
    const savings = await addAccount("Savings", "savings");
    const created = await json<Txn>(
      await post({ accountId: checking.id, amount: "-700", payeeName: "Bank", memo: "move" }),
    );

    const made = await json<Txn>(await patch(created.id, { transferAccountId: savings.id }));
    expect(made).toMatchObject({ payeeName: "Transfer : Savings", categoryId: null });
    const otherId = made.transferTransactionId ?? "";
    expect(await find(otherId)).toMatchObject({ amount: "700", memo: "move" });

    const undone = await json<Txn>(await patch(created.id, { payeeName: "Bank" }));
    expect(undone).toMatchObject({
      payeeName: "Bank",
      transferAccountId: null,
      transferTransactionId: null,
      categoryName: "Uncategorized",
    });
    expect(await find(otherId)).toBeUndefined();
    expect(await register(savings.id)).toHaveLength(1);
  });

  it("deletes both sides from either one", async () => {
    const { base, cookie, addAccount, transfer, register } = await setup();
    const checking = await addAccount("Checking", "checking", "100000");
    const savings = await addAccount("Savings", "savings");
    const out = await transfer(checking, savings, "-2000");
    const res = await send("DELETE", `${base}/transactions/${out.transferTransactionId}`, cookie);
    expect(res.status).toBe(204);
    expect((await register()).filter((t) => t.transferAccountId)).toEqual([]);
  });

  it("won't change or delete a transfer whose other side is reconciled", async () => {
    const { base, cookie, addAccount, transfer, patch, find } = await setup();
    const checking = await addAccount("Checking", "checking", "100000");
    const savings = await addAccount("Savings", "savings");
    const out = await transfer(checking, savings, "-2000");
    const otherId = out.transferTransactionId ?? "";
    await db.update(transaction).set({ cleared: "reconciled" }).where(eq(transaction.id, otherId));

    for (const body of [{ amount: "-1" }, { date: "2026-10-02" }, { payeeName: "Bank" }]) {
      const res = await patch(out.id, body);
      expect(res.status).toBe(409);
      expect((await json<ErrorBody>(res)).error.code).toBe("TRANSFER_RECONCILED");
    }
    const del = await send("DELETE", `${base}/transactions/${out.id}`, cookie);
    expect(del.status).toBe(409);

    // Memo and cleared are this side's own.
    expect((await patch(out.id, { memo: "ok", cleared: "cleared" })).status).toBe(200);
    expect(await find(otherId)).toMatchObject({ amount: "2000", cleared: "reconciled" });
  });

  it("keeps accounts with transfers from being deleted", async () => {
    const { base, cookie, addAccount, transfer } = await setup();
    const checking = await addAccount("Checking", "checking", "100000");
    const savings = await addAccount("Savings", "savings");
    await transfer(checking, savings, "-2000");
    const res = await send("DELETE", `${base}/accounts/${savings.id}`, cookie);
    expect((await json<ErrorBody>(res)).error.code).toBe("ACCOUNT_HAS_HISTORY");
  });

  it("can still edit a transfer to an account closed since", async () => {
    const { base, cookie, addAccount, transfer, patch, find } = await setup();
    const checking = await addAccount("Checking", "checking", "100000");
    const savings = await addAccount("Savings", "savings");
    const out = await transfer(checking, savings, "-2000");
    await send("POST", `${base}/accounts/${savings.id}/close`, cookie, { date: TODAY });
    expect((await patch(out.id, { amount: "-2500" })).status).toBe(200);
    expect((await find(out.transferTransactionId ?? ""))?.amount).toBe("2500");
  });

  it("renames transfer payees with their account and keeps them out of the payee list", async () => {
    const { base, cookie, addAccount, transfer, post, find } = await setup();
    const checking = await addAccount("Checking", "checking", "100000");
    const savings = await addAccount("Savings", "savings");
    const out = await transfer(checking, savings, "-2000");
    await send("PATCH", `${base}/accounts/${savings.id}`, cookie, { name: "Emergency Fund" });
    expect((await find(out.id))?.payeeName).toBe("Transfer : Emergency Fund");

    // A payee typed with the same name is a normal payee, not the transfer one.
    const typed = await json<Txn>(
      await post({ accountId: checking.id, amount: "-1", payeeName: "Transfer : Emergency Fund" }),
    );
    expect(typed.transferAccountId).toBeNull();
    const { payees } = await json<{ payees: { name: string }[] }>(
      await send("GET", `${base}/payees`, cookie),
    );
    expect(payees.map((p) => p.name)).toEqual(["Transfer : Emergency Fund"]);
  });
});
