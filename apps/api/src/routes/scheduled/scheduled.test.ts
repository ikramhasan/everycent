import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBudget, createTestApp, resetDatabase, signUp } from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

type Account = { id: string; name: string; balances: { working: string } };
type Line = {
  id: string;
  amount: string;
  payeeName: string | null;
  categoryId: string | null;
  memo: string;
  transferAccountId: string | null;
};
type Scheduled = {
  id: string;
  scheduledTransactionId: string;
  kind: "schedule" | "transfer" | "splitTransfer";
  accountId: string;
  frequency: string;
  dateFirst: string;
  dateNext: string;
  amount: string;
  payeeName: string | null;
  categoryId: string | null;
  memo: string;
  flag: string | null;
  transferAccountId: string | null;
  subtransactions: Line[];
};
type Written = { scheduledTransaction: Scheduled | null; enteredTransactionId: string | null };
type Txn = {
  id: string;
  accountId: string;
  date: string;
  amount: string;
  payeeName: string | null;
  categoryId: string | null;
  memo: string;
  cleared: string;
  approved: boolean;
  flag: string | null;
  transferAccountId: string | null;
  subtransactions: Line[];
};
type Category = { id: string; name: string };
type Group = { kind: string | null; categories: Category[] };
type ErrorBody = { error: { code: string } };

const START = "2026-10-01";
const TODAY = "2026-10-11";

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
  const addAccount = async (name: string, type: string, balance = "100000") =>
    json<Account>(
      await send("POST", `${base}/accounts`, cookie, { name, type, balance, date: START }),
    );
  const groups = (await json<{ groups: Group[] }>(await send("GET", `${base}/categories`, cookie)))
    .groups;
  const [rent, groceries] = groups.filter((g) => !g.kind).flatMap((g) => g.categories);
  if (!rent || !groceries) throw new Error("starter categories missing");

  const schedule = async (input: Record<string, unknown>, status = 201) => {
    const res = await send("POST", `${base}/scheduled-transactions`, cookie, {
      today: TODAY,
      ...input,
    });
    expect(res.status, await res.clone().text()).toBe(status);
    return json<Written>(res);
  };
  const patch = async (id: string, body: Record<string, unknown>, status = 200) => {
    const res = await send("PATCH", `${base}/scheduled-transactions/${id}`, cookie, {
      today: TODAY,
      ...body,
    });
    expect(res.status, await res.clone().text()).toBe(status);
    return json<Written>(res);
  };
  const list = async (query = "") =>
    (
      await json<{ scheduledTransactions: Scheduled[] }>(
        await send("GET", `${base}/scheduled-transactions?${query}`, cookie),
      )
    ).scheduledTransactions;
  const enterNow = async (id: string, today = TODAY) => {
    const res = await send("POST", `${base}/scheduled-transactions/${id}/enter`, cookie, {
      today,
    });
    expect(res.status, await res.clone().text()).toBe(200);
    return json<{ transaction: Txn; scheduledTransaction: Scheduled | null }>(res);
  };
  const register = async (accountId: string, today?: string) =>
    (
      await json<{ transactions: Txn[] }>(
        await send(
          "GET",
          `${base}/transactions?accountId=${accountId}${today ? `&today=${today}` : ""}`,
          cookie,
        ),
      )
    ).transactions.filter((t) => t.payeeName !== "Starting Balance");
  const balance = async (accountId: string, today = TODAY) => {
    const { accounts } = await json<{ accounts: Account[] }>(
      await send("GET", `${base}/accounts?today=${today}`, cookie),
    );
    return accounts.find((a) => a.id === accountId)?.balances.working;
  };
  return {
    cookie,
    base,
    addAccount,
    rent,
    groceries,
    schedule,
    patch,
    list,
    enterNow,
    register,
    balance,
  };
}

describe("scheduled transactions", () => {
  it("keeps a future transaction out of the register and balances until it's entered", async () => {
    const ctx = await setup();
    const checking = await ctx.addAccount("Checking", "checking");
    const { scheduledTransaction, enteredTransactionId } = await ctx.schedule({
      accountId: checking.id,
      date: "2026-10-20",
      amount: "-2500",
      payeeName: "Power Co",
      categoryId: ctx.rent.id,
      memo: "bill",
      flag: "red",
    });
    expect(enteredTransactionId).toBeNull();
    expect(scheduledTransaction).toMatchObject({
      kind: "schedule",
      frequency: "never",
      dateFirst: "2026-10-20",
      dateNext: "2026-10-20",
      amount: "-2500",
      payeeName: "Power Co",
      categoryId: ctx.rent.id,
      flag: "red",
    });
    expect(await ctx.register(checking.id)).toEqual([]);
    expect(await ctx.balance(checking.id)).toBe("100000");
    expect(await ctx.list(`accountId=${checking.id}`)).toHaveLength(1);
  });

  it("enters a due occurrence on its own date, unapproved, every missed one (YNAB)", async () => {
    const ctx = await setup();
    const checking = await ctx.addAccount("Checking", "checking");
    const { scheduledTransaction: s } = await ctx.schedule({
      accountId: checking.id,
      frequency: "daily",
      date: "2026-10-05",
      amount: "-100",
      payeeName: "Coffee",
      today: "2026-10-01",
    });
    // Nothing is entered until a read brings the user's today.
    expect(await ctx.register(checking.id)).toEqual([]);
    const entered = await ctx.register(checking.id, TODAY);
    expect(entered.map((t) => t.date)).toEqual([
      "2026-10-11",
      "2026-10-10",
      "2026-10-09",
      "2026-10-08",
      "2026-10-07",
      "2026-10-06",
      "2026-10-05",
    ]);
    expect(entered.every((t) => !t.approved && t.cleared === "uncleared")).toBe(true);
    const [row] = await ctx.list(`today=${TODAY}`);
    expect(row).toMatchObject({ id: s?.id, dateNext: "2026-10-12", dateFirst: "2026-10-05" });
    // Reading again enters nothing twice.
    expect(await ctx.register(checking.id, TODAY)).toHaveLength(7);
  });

  it("enters a cash account's occurrences cleared and copies the flag", async () => {
    const ctx = await setup();
    const wallet = await ctx.addAccount("Wallet", "cash");
    await ctx.schedule({
      accountId: wallet.id,
      frequency: "monthly",
      date: "2026-10-09",
      amount: "-1900",
      payeeName: "Market",
      flag: "blue",
      today: "2026-10-01",
    });
    const [entered] = await ctx.register(wallet.id, TODAY);
    expect(entered).toMatchObject({ date: "2026-10-09", cleared: "cleared", flag: "blue" });
  });

  it("Enter Now dates it today, approved, and moves the schedule on", async () => {
    const ctx = await setup();
    const checking = await ctx.addAccount("Checking", "checking");
    const { scheduledTransaction: monthly } = await ctx.schedule({
      accountId: checking.id,
      frequency: "monthly",
      date: "2026-10-31",
      amount: "-2000",
      payeeName: "Gym",
      categoryId: ctx.groceries.id,
    });
    const id = monthly?.id ?? "";
    const first = await ctx.enterNow(id);
    expect(first.transaction).toMatchObject({
      date: TODAY,
      amount: "-2000",
      approved: true,
      cleared: "uncleared",
      categoryId: ctx.groceries.id,
    });
    expect(first.scheduledTransaction?.dateNext).toBe("2026-11-30");
    // Counted from the first date, so the 31st comes back.
    expect((await ctx.enterNow(id)).scheduledTransaction?.dateNext).toBe("2026-12-31");

    const { scheduledTransaction: once } = await ctx.schedule({
      accountId: checking.id,
      date: "2026-10-14",
      amount: "-500",
      payeeName: "Once",
    });
    expect((await ctx.enterNow(once?.id ?? "")).scheduledTransaction).toBeNull();
    expect((await ctx.list()).map((r) => r.payeeName)).toEqual(["Gym"]);
  });

  it("starts a past-dated repeat after today, entering only the date given (YNAB)", async () => {
    const ctx = await setup();
    const checking = await ctx.addAccount("Checking", "checking");
    const written = await ctx.schedule({
      accountId: checking.id,
      frequency: "monthly",
      date: "2026-09-01",
      amount: "-122",
      payeeName: "Add Sep",
    });
    expect(written.scheduledTransaction).toMatchObject({
      dateFirst: "2026-09-01",
      dateNext: "2026-11-01",
    });
    const entered = await ctx.register(checking.id);
    expect(entered).toHaveLength(1);
    expect(entered[0]).toMatchObject({
      id: written.enteredTransactionId,
      date: "2026-09-01",
      approved: false,
    });

    const once = await ctx.schedule({
      accountId: checking.id,
      date: "2026-10-05",
      amount: "-50",
      payeeName: "Past once",
    });
    expect(once.scheduledTransaction).toBeNull();
    expect(once.enteredTransactionId).not.toBeNull();
  });

  it("shows a scheduled transfer in both accounts and enters both sides", async () => {
    const ctx = await setup();
    const checking = await ctx.addAccount("Checking", "checking");
    const wallet = await ctx.addAccount("Wallet", "cash");
    const { scheduledTransaction: s } = await ctx.schedule({
      accountId: checking.id,
      frequency: "monthly",
      date: "2026-10-20",
      amount: "-5000",
      transferAccountId: wallet.id,
      memo: "x-xfer",
    });
    expect(s).toMatchObject({ payeeName: "Transfer : Wallet", transferAccountId: wallet.id });
    const [mirror] = await ctx.list(`accountId=${wallet.id}`);
    expect(mirror).toMatchObject({
      kind: "transfer",
      scheduledTransactionId: s?.id,
      accountId: wallet.id,
      amount: "5000",
      payeeName: "Transfer : Checking",
      transferAccountId: checking.id,
      memo: "x-xfer",
      dateNext: "2026-10-20",
    });
    expect(await ctx.list()).toHaveLength(2);

    await ctx.enterNow(s?.id ?? "");
    const [out] = await ctx.register(checking.id);
    const [into] = await ctx.register(wallet.id);
    expect(out).toMatchObject({
      amount: "-5000",
      cleared: "uncleared",
      transferAccountId: wallet.id,
    });
    // Each side follows its own account: the cash side enters cleared.
    expect(into).toMatchObject({
      amount: "5000",
      cleared: "cleared",
      transferAccountId: checking.id,
    });
  });

  it("keeps a transfer's category on its budget side, even from a tracking account", async () => {
    const ctx = await setup();
    const checking = await ctx.addAccount("Checking", "checking");
    const house = await ctx.addAccount("House", "asset");
    const { scheduledTransaction: s } = await ctx.schedule({
      accountId: house.id,
      date: "2026-10-20",
      amount: "-700",
      transferAccountId: checking.id,
      categoryId: ctx.rent.id,
    });
    expect(s?.categoryId).toBeNull();
    const [mirror] = await ctx.list(`accountId=${checking.id}`);
    expect(mirror?.categoryId).toBe(ctx.rent.id);
    await ctx.enterNow(s?.id ?? "");
    const [budgetSide] = await ctx.register(checking.id);
    expect(budgetSide?.categoryId).toBe(ctx.rent.id);
  });

  it("schedules splits with transfer lines, shown and entered in the other account", async () => {
    const ctx = await setup();
    const checking = await ctx.addAccount("Checking", "checking");
    const savings = await ctx.addAccount("Savings", "savings");
    const { scheduledTransaction: s } = await ctx.schedule({
      accountId: checking.id,
      frequency: "monthly",
      date: "2026-10-25",
      amount: "-5000",
      payeeName: "Payday split",
      subtransactions: [
        { amount: "-2000", categoryId: ctx.groceries.id, memo: "x-sl1" },
        { amount: "-3000", transferAccountId: savings.id },
      ],
    });
    expect(s?.categoryId).toBeNull();
    expect(s?.subtransactions.map((l) => [l.amount, l.transferAccountId])).toEqual([
      ["-2000", null],
      ["-3000", savings.id],
    ]);
    const [line] = await ctx.list(`accountId=${savings.id}`);
    expect(line).toMatchObject({ kind: "splitTransfer", amount: "3000", flag: null });

    await ctx.enterNow(s?.id ?? "");
    const [split] = await ctx.register(checking.id);
    expect(split?.subtransactions.map((l) => l.amount)).toEqual(["-2000", "-3000"]);
    const [counterpart] = await ctx.register(savings.id);
    expect(counterpart).toMatchObject({ amount: "3000", date: TODAY });
    expect((await ctx.list(`accountId=${savings.id}`))[0]?.dateNext).toBe("2026-11-25");
  });

  it("follows the transaction rules for splits and transfers", async () => {
    const ctx = await setup();
    const checking = await ctx.addAccount("Checking", "checking");
    const savings = await ctx.addAccount("Savings", "savings");
    const bad = async (input: Record<string, unknown>, code: string) => {
      const res = await send("POST", `${ctx.base}/scheduled-transactions`, ctx.cookie, {
        accountId: checking.id,
        date: "2026-10-20",
        amount: "-1000",
        today: TODAY,
        ...input,
      });
      expect(res.status).toBe(400);
      expect((await json<ErrorBody>(res)).error.code).toBe(code);
    };
    await bad(
      {
        subtransactions: [
          { amount: "-100", categoryId: null },
          { amount: "-100", categoryId: null },
        ],
      },
      "SPLIT_TOTAL_MISMATCH",
    );
    await bad(
      {
        transferAccountId: savings.id,
        subtransactions: [
          { amount: "-500", categoryId: null },
          { amount: "-500", categoryId: null },
        ],
      },
      "SPLIT_NOT_ALLOWED",
    );
    await bad({ transferAccountId: checking.id }, "TRANSFER_SAME_ACCOUNT");
    await bad({ transferAccountId: savings.id, categoryId: ctx.rent.id }, "CATEGORY_NOT_ALLOWED");
  });

  it("restarts the repeats at a new date and enters it if it's past", async () => {
    const ctx = await setup();
    const savings = await ctx.addAccount("Savings", "savings");
    const { scheduledTransaction: s } = await ctx.schedule({
      accountId: savings.id,
      frequency: "monthly",
      date: "2026-10-31",
      amount: "-111",
      payeeName: "Add past",
    });
    const id = s?.id ?? "";
    const moved = await ctx.patch(id, { date: "2026-11-15" });
    expect(moved.scheduledTransaction).toMatchObject({
      dateFirst: "2026-11-15",
      dateNext: "2026-11-15",
    });
    // YNAB: a past date resets the first date, enters that occurrence and moves on.
    const past = await ctx.patch(id, { date: "2026-10-08" });
    expect(past.scheduledTransaction).toMatchObject({
      dateFirst: "2026-10-08",
      dateNext: "2026-11-08",
    });
    expect((await ctx.register(savings.id)).map((t) => [t.date, t.approved])).toEqual([
      ["2026-10-08", false],
    ]);
    const weekly = await ctx.patch(id, { frequency: "weekly" });
    expect(weekly.scheduledTransaction).toMatchObject({
      frequency: "weekly",
      dateFirst: "2026-11-08",
      dateNext: "2026-11-08",
    });
  });

  it("edits keep a split's lines, and a payee turns a transfer into a payment", async () => {
    const ctx = await setup();
    const checking = await ctx.addAccount("Checking", "checking");
    const savings = await ctx.addAccount("Savings", "savings");
    const { scheduledTransaction: split } = await ctx.schedule({
      accountId: checking.id,
      date: "2026-10-25",
      amount: "-300",
      payeeName: "Split",
      subtransactions: [
        { amount: "-100", categoryId: ctx.rent.id },
        { amount: "-200", categoryId: ctx.groceries.id },
      ],
    });
    const memo = await ctx.patch(split?.id ?? "", { memo: "kept" });
    expect(memo.scheduledTransaction?.subtransactions.map((l) => l.categoryId)).toEqual([
      ctx.rent.id,
      ctx.groceries.id,
    ]);
    const unsplit = await ctx.patch(split?.id ?? "", { categoryId: ctx.rent.id });
    expect(unsplit.scheduledTransaction).toMatchObject({
      categoryId: ctx.rent.id,
      subtransactions: [],
    });

    const { scheduledTransaction: transfer } = await ctx.schedule({
      accountId: checking.id,
      date: "2026-10-26",
      amount: "-400",
      transferAccountId: savings.id,
    });
    const paid = await ctx.patch(transfer?.id ?? "", { payeeName: "Landlord" });
    expect(paid.scheduledTransaction).toMatchObject({
      payeeName: "Landlord",
      transferAccountId: null,
    });
    expect(await ctx.list(`accountId=${savings.id}`)).toEqual([]);
  });

  it("turns a transaction moved into the future into a schedule, with its transfer", async () => {
    const ctx = await setup();
    const checking = await ctx.addAccount("Checking", "checking");
    const savings = await ctx.addAccount("Savings", "savings");
    const res = await send("POST", `${ctx.base}/transactions`, ctx.cookie, {
      accountId: checking.id,
      date: "2026-10-05",
      amount: "-900",
      transferAccountId: savings.id,
      categoryId: null,
    });
    const created = await json<Txn>(res);
    const { scheduledTransaction } = await ctx.schedule({
      accountId: checking.id,
      date: "2026-10-20",
      amount: "-900",
      transferAccountId: savings.id,
      fromTransactionId: created.id,
    });
    expect(scheduledTransaction?.dateNext).toBe("2026-10-20");
    expect(await ctx.register(checking.id)).toEqual([]);
    expect(await ctx.register(savings.id)).toEqual([]);
  });

  it("searches and filters scheduled rows like the register (they count as uncleared)", async () => {
    const ctx = await setup();
    const checking = await ctx.addAccount("Checking", "checking");
    for (const [date, payeeName, amount] of [
      ["2026-10-20", "Power Co", "-2500"],
      ["2026-11-20", "Water Co", "-1500"],
    ] as const) {
      await ctx.schedule({ accountId: checking.id, date, amount, payeeName, memo: "util" });
    }
    const names = async (query: string) => (await ctx.list(query)).map((r) => r.payeeName);
    expect(await names("q=power")).toEqual(["Power Co"]);
    expect(await names(`q=${encodeURIComponent("Outflow: >=20")}`)).toEqual(["Power Co"]);
    expect(await names(`q=${encodeURIComponent("Is: Uncleared, util")}`)).toEqual([
      "Water Co",
      "Power Co",
    ]);
    expect(await names(`q=${encodeURIComponent("Is: Cleared")}`)).toEqual([]);
    expect(await names("from=2026-11-01&to=2026-11-30")).toEqual(["Water Co"]);
  });

  it("leaves a closed account's schedules waiting, but Enter Now still works", async () => {
    const ctx = await setup();
    const old = await ctx.addAccount("Old", "checking", "0");
    const { scheduledTransaction: s } = await ctx.schedule({
      accountId: old.id,
      frequency: "daily",
      date: "2026-10-05",
      amount: "-100",
      payeeName: "Daily",
      today: "2026-10-01",
    });
    const closed = await send("POST", `${ctx.base}/accounts/${old.id}/close`, ctx.cookie, {
      date: START,
    });
    expect(closed.status).toBe(200);
    expect(await ctx.register(old.id, TODAY)).toEqual([]);
    expect((await ctx.list(`today=${TODAY}`))[0]?.dateNext).toBe("2026-10-05");
    const { transaction } = await ctx.enterNow(s?.id ?? "");
    expect(transaction.date).toBe(TODAY);
  });

  it("moves schedules with a deleted category and drops transfers to a deleted account", async () => {
    const ctx = await setup();
    const checking = await ctx.addAccount("Checking", "checking");
    const spare = await ctx.addAccount("Spare", "savings", "0");
    await ctx.schedule({
      accountId: checking.id,
      date: "2026-10-20",
      amount: "-100",
      payeeName: "Rent",
      categoryId: ctx.rent.id,
    });
    await ctx.schedule({
      accountId: checking.id,
      date: "2026-10-21",
      amount: "-100",
      transferAccountId: spare.id,
    });
    const refused = await send("DELETE", `${ctx.base}/categories/${ctx.rent.id}`, ctx.cookie);
    expect(refused.status).toBe(409);
    const moved = await send(
      "DELETE",
      `${ctx.base}/categories/${ctx.rent.id}?reassignToCategoryId=${ctx.groceries.id}`,
      ctx.cookie,
    );
    expect(moved.status).toBe(204);
    expect((await ctx.list()).find((r) => r.payeeName === "Rent")?.categoryId).toBe(
      ctx.groceries.id,
    );
    expect((await send("DELETE", `${ctx.base}/accounts/${spare.id}`, ctx.cookie)).status).toBe(204);
    expect((await ctx.list()).map((r) => r.payeeName)).toEqual(["Rent"]);
  });
});
