import { newId } from "@everycent/db";
import { budgetMember } from "@everycent/db/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createBudget,
  createTestApp,
  resetDatabase,
  signUp,
  type TestBudget,
} from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

type Account = {
  id: string;
  name: string;
  type: string;
  note: string;
  closed: boolean;
  paymentCategoryId: string | null;
  balances: { working: string };
};
type Category = {
  id: string;
  name: string;
  note: string;
  hidden: boolean;
  linkedAccountId: string | null;
  target: Record<string, unknown> | null;
};
type Group = { name: string; kind: string | null; hidden: boolean; categories: Category[] };
type Txn = { amount: string; payeeName: string | null; categoryName: string | null; date: string };
type Budget = TestBudget & { archivedAt: string | null };

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
  const owner = await signUp(app);
  const budget = await createBudget(app, owner.cookie, { name: "Household" });
  const base = `/v1/budgets/${budget.id}`;
  const addAccount = async (input: Record<string, unknown>) =>
    json<Account>(await send("POST", `${base}/accounts`, owner.cookie, { date: TODAY, ...input }));
  return { owner, budget, base, addAccount };
}

const freshStart = (budgetId: string, cookie: string) =>
  send("POST", `/v1/budgets/${budgetId}/fresh-start`, cookie, { date: TODAY });

describe("fresh start", () => {
  it("archives the old budget and continues in a copy without transactions", async () => {
    const { owner, budget, base, addAccount } = await setup();
    const checking = await addAccount({ name: "Checking", type: "checking", balance: "250000" });
    const visa = await addAccount({ name: "Visa", type: "credit_card", balance: "-37500" });
    await addAccount({ name: "Mortgage", type: "mortgage", balance: "-100000", interestRate: "6" });
    const old = await json<Account>(
      await send("POST", `${base}/accounts/${checking.id}/close`, owner.cookie, { date: TODAY }),
    );
    expect(old.closed).toBe(true);
    // Customise the categories so we can see they're copied rather than re-seeded.
    const groups = (
      await json<{ groups: Group[] }>(await send("GET", `${base}/categories`, owner.cookie))
    ).groups;
    const bills = groups.find((g) => g.name === "Bills");
    await send("PATCH", `${base}/categories/${bills?.categories[0]?.id}`, owner.cookie, {
      note: "Due on the 1st",
      hidden: true,
    });
    const spend = await send("POST", `${base}/transactions`, owner.cookie, {
      accountId: visa.id,
      date: TODAY,
      amount: "-1000",
      payeeName: "Costco",
      categoryId: bills?.categories[1]?.id,
    });
    expect(spend.status).toBe(201);

    const res = await freshStart(budget.id, owner.cookie);
    expect(res.status).toBe(201);
    const fresh = await json<Budget>(res);
    expect(fresh).toMatchObject({
      name: "Household",
      currency: budget.currency,
      numberFormat: budget.numberFormat,
      dateFormat: budget.dateFormat,
      role: "owner",
      archivedAt: null,
    });
    expect(fresh.id).not.toBe(budget.id);

    // The new budget is the one the owner lands on next.
    const list = await json<{ lastUsedBudgetId: string }>(
      await send("GET", "/v1/budgets", owner.cookie),
    );
    expect(list.lastUsedBudgetId).toBe(fresh.id);

    const archived = await json<Budget>(await send("GET", base, owner.cookie));
    expect(archived.name).toBe("Household (Archived 10/01/2026)");
    expect(archived.archivedAt).not.toBeNull();

    const freshBase = `/v1/budgets/${fresh.id}`;
    const accounts = (
      await json<{ accounts: Account[] }>(await send("GET", `${freshBase}/accounts`, owner.cookie))
    ).accounts;
    expect(accounts.map((a) => [a.name, a.type, a.closed, a.balances.working])).toEqual([
      ["Checking", "checking", true, "0"],
      ["Visa", "credit_card", false, "-38500"],
      ["Mortgage", "mortgage", false, "-100000"],
    ]);
    const newVisa = accounts.find((a) => a.name === "Visa");
    const visaTxns = (
      await json<{ transactions: Txn[] }>(
        await send("GET", `${freshBase}/transactions?accountId=${newVisa?.id}`, owner.cookie),
      )
    ).transactions;
    expect(visaTxns).toEqual([
      expect.objectContaining({ amount: "-38500", payeeName: "Starting Balance", date: TODAY }),
    ]);
    // Payees come along; with no transactions yet there's no category to suggest.
    const payees = await json<{ payees: unknown[] }>(
      await send("GET", `${freshBase}/payees`, owner.cookie),
    );
    expect(payees.payees).toEqual([
      { id: expect.any(String), name: "Costco", lastCategoryId: null },
    ]);

    const freshGroups = (
      await json<{ groups: Group[] }>(await send("GET", `${freshBase}/categories`, owner.cookie))
    ).groups;
    expect(freshGroups.map((g) => g.name)).toEqual(groups.map((g) => g.name));
    const freshBills = freshGroups.find((g) => g.name === "Bills");
    expect(freshBills?.categories[0]).toMatchObject({ note: "Due on the 1st", hidden: true });
    // The payment category follows the new card, not the archived one.
    const payment = freshGroups[0]?.categories[0];
    expect(payment).toMatchObject({ name: "Visa", linkedAccountId: newVisa?.id });
    expect(newVisa?.paymentCategoryId).toBe(payment?.id);
    expect(visa.id).not.toBe(newVisa?.id);
  });

  // YNAB, 2026-10-12: "C4 Order" → "C4 Order FS" kept every schedule, and the old plan kept them.
  it("copies scheduled transactions onto the new accounts, categories and payees", async () => {
    const { owner, budget, base, addAccount } = await setup();
    const checking = await addAccount({ name: "Checking", type: "checking", balance: "250000" });
    const visa = await addAccount({ name: "Visa", type: "credit_card", balance: "-37500" });
    const [rent, utilities] = (
      await json<{ groups: Group[] }>(await send("GET", `${base}/categories`, owner.cookie))
    ).groups.flatMap((g) => (g.kind ? [] : g.categories));
    const schedule = async (input: Record<string, unknown>) => {
      const res = await send("POST", `${base}/scheduled-transactions`, owner.cookie, {
        accountId: checking.id,
        today: TODAY,
        ...input,
      });
      expect(res.status, await res.clone().text()).toBe(201);
    };
    await schedule({
      date: "2026-10-24",
      frequency: "monthly",
      amount: "-6000",
      payeeName: "Landlord",
      categoryId: rent?.id,
      memo: "x-order2",
      flag: "red",
    });
    await schedule({ date: "2026-10-21", amount: "-5000", transferAccountId: visa.id });
    await schedule({
      date: "2026-10-15",
      amount: "-900",
      payeeName: "Shop",
      subtransactions: [
        { amount: "-400", categoryId: rent?.id },
        { amount: "-500", categoryId: utilities?.id },
      ],
    });

    const fresh = await json<Budget>(await freshStart(budget.id, owner.cookie));
    const freshBase = `/v1/budgets/${fresh.id}`;
    type Row = {
      kind: string;
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
      subtransactions: { amount: string; categoryId: string | null }[];
    };
    const list = async (b: string) =>
      (
        await json<{ scheduledTransactions: Row[] }>(
          await send("GET", `${b}/scheduled-transactions`, owner.cookie),
        )
      ).scheduledTransactions.filter((r) => r.kind === "schedule");
    const accounts = (
      await json<{ accounts: Account[] }>(await send("GET", `${freshBase}/accounts`, owner.cookie))
    ).accounts;
    const newChecking = accounts.find((a) => a.name === "Checking");
    const newVisa = accounts.find((a) => a.name === "Visa");
    const [newRent, newUtilities] = (
      await json<{ groups: Group[] }>(await send("GET", `${freshBase}/categories`, owner.cookie))
    ).groups.flatMap((g) => (g.kind ? [] : g.categories));

    const copied = await list(freshBase);
    expect(copied).toHaveLength(3);
    expect(copied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: newChecking?.id,
          frequency: "monthly",
          dateFirst: "2026-10-24",
          dateNext: "2026-10-24",
          amount: "-6000",
          payeeName: "Landlord",
          categoryId: newRent?.id,
          memo: "x-order2",
          flag: "red",
        }),
        expect.objectContaining({ amount: "-5000", transferAccountId: newVisa?.id }),
        expect.objectContaining({
          amount: "-900",
          subtransactions: [
            expect.objectContaining({ amount: "-400", categoryId: newRent?.id }),
            expect.objectContaining({ amount: "-500", categoryId: newUtilities?.id }),
          ],
        }),
      ]),
    );
    // The archived budget keeps its own.
    expect(await list(base)).toHaveLength(3);
  });

  it("brings partners along with their roles", async () => {
    const { owner, budget } = await setup();
    const partner = await signUp(app);
    const me = await json<{ id: string }>(await send("GET", "/v1/me", partner.cookie));
    await db
      .insert(budgetMember)
      .values({ id: newId(), budgetId: budget.id, userId: me.id, role: "editor" });

    const fresh = await json<Budget>(await freshStart(budget.id, owner.cookie));
    const seen = await json<Budget>(await send("GET", `/v1/budgets/${fresh.id}`, partner.cookie));
    expect(seen.role).toBe("editor");
  });

  it("is only for the owner", async () => {
    const { budget } = await setup();
    const partner = await signUp(app);
    const me = await json<{ id: string }>(await send("GET", "/v1/me", partner.cookie));
    await db
      .insert(budgetMember)
      .values({ id: newId(), budgetId: budget.id, userId: me.id, role: "editor" });
    expect((await freshStart(budget.id, partner.cookie)).status).toBe(403);
  });

  it("can't fresh-start an archived budget twice", async () => {
    const { owner, budget } = await setup();
    expect((await freshStart(budget.id, owner.cookie)).status).toBe(201);
    const again = await freshStart(budget.id, owner.cookie);
    expect(again.status).toBe(409);
    expect((await json<{ error: { code: string } }>(again)).error.code).toBe("ALREADY_ARCHIVED");
  });

  it("copies targets, starting in the fresh start's month", async () => {
    const { owner, budget, base } = await setup();
    const categories = async (b: string) =>
      (
        await json<{ groups: Group[] }>(
          await send("GET", `/v1/budgets/${b}/categories`, owner.cookie),
        )
      ).groups.flatMap((g) => g.categories);
    const [rent] = await categories(budget.id);
    if (!rent) throw new Error("starter data missing");
    await send("PUT", `${base}/categories/${rent.id}/target`, owner.cookie, {
      cadence: "monthly",
      behavior: "refill",
      amount: "12000",
      dueDay: 5,
      month: "2026-08",
    });
    const fresh = await json<Budget>(await freshStart(budget.id, owner.cookie));
    const copy = (await categories(fresh.id)).find((c) => c.name === rent.name);
    expect(copy?.target).toEqual({
      cadence: "monthly",
      behavior: "refill",
      amount: "12000",
      dueDay: 5,
      dueDate: null,
      repeatEvery: null,
      repeatUnit: null,
      startMonth: "2026-10",
      snoozedMonth: null,
    });
  });

  it("starts budgets created from scratch with the template", async () => {
    const { owner, base } = await setup();
    const groups = (
      await json<{ groups: Group[] }>(await send("GET", `${base}/categories`, owner.cookie))
    ).groups;
    expect(groups.map((g) => g.name)).toContain("Bills");
  });
});
