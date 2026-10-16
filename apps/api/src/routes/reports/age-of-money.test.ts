import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBudget, createTestApp, resetDatabase, signUp } from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

type AgeOfMoney = {
  asOf: string;
  current: number | null;
  thirtyDaysAgo: number | null;
  months: { month: string; days: number | null }[];
};
type Group = { id: string; kind: string | null; categories: { id: string; name: string }[] };

function send(method: string, path: string, cookie: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const json = async <T>(res: Response) => (await res.json()) as T;

/**
 * Cash spending, a transfer between cash accounts (no outflow), card spending (no outflow until
 * paid), a card payment and a transfer to a tracking account (outflows), a starting balance (an
 * inflow) and a split with a line moving money to savings (left out).
 */
async function setup() {
  const { cookie } = await signUp(app);
  const budget = await createBudget(app, cookie);
  const base = `/v1/budgets/${budget.id}`;
  const account = async (name: string, type: string, balance = "0") =>
    json<{ id: string }>(
      await send("POST", `${base}/accounts`, cookie, { name, type, balance, date: "2026-09-01" }),
    );
  const checking = await account("Checking", "checking", "100000");
  const savings = await account("Savings", "savings");
  const visa = await account("Visa", "credit_card");
  const house = await account("House", "asset");
  const { groups, readyToAssignCategoryId } = await json<{
    groups: Group[];
    readyToAssignCategoryId: string;
  }>(await send("GET", `${base}/categories`, cookie));
  const groceries = groups.find((g) => !g.kind)?.categories[0];
  if (!groceries) throw new Error("starter data missing");

  const add = async (input: Record<string, unknown>) => {
    const res = await send("POST", `${base}/transactions?today=2026-10-20`, cookie, {
      accountId: checking.id,
      categoryId: null,
      ...input,
    });
    expect(res.status).toBe(201);
  };
  const spend = (date: string, amount: string, accountId = checking.id) =>
    add({ date, amount, accountId, categoryId: groceries.id });

  await add({ date: "2026-09-05", amount: "-20000", transferAccountId: savings.id });
  await spend("2026-09-10", "-5000", visa.id);
  await spend("2026-09-11", "-1000", savings.id); // 10 days old
  await add({ date: "2026-09-21", amount: "-5000", transferAccountId: visa.id }); // 20
  await add({ date: "2026-09-21", amount: "-1000", transferAccountId: house.id }); // 20
  for (let d = 1; d <= 7; d++) await spend(`2026-10-0${d}`, "-100"); // 30 … 36
  await add({
    date: "2026-10-10",
    amount: "-3000",
    subtransactions: [
      { amount: "-2000", categoryId: groceries.id },
      { amount: "-1000", transferAccountId: savings.id },
    ],
  }); // $20 counted, 39 days
  await add({ date: "2026-10-15", amount: "10000", categoryId: readyToAssignCategoryId });

  const get = async (today: string, as = cookie) =>
    send("GET", `${base}/reports/age-of-money?today=${today}`, as);
  return { get };
}

describe("GET /reports/age-of-money", () => {
  it("averages the last ten cash outflows' ages", async () => {
    const { get } = await setup();
    const res = await get("2026-10-20");
    expect(res.status).toBe(200);
    // Last ten: 20, 20, 30 … 36, 39 → 31.0.
    expect(await json<AgeOfMoney>(res)).toEqual({
      asOf: "2026-10-20",
      current: 31,
      thirtyDaysAgo: null,
      months: [
        { month: "2026-09", days: null },
        { month: "2026-10", days: 31 },
      ],
    });
  });

  it("is null with fewer than ten outflows, and reads as of the user's today", async () => {
    const { get } = await setup();
    // By 10-06: nine outflows.
    expect((await json<AgeOfMoney>(await get("2026-10-06"))).current).toBeNull();
    // By 10-07: 10, 20, 20, 30 … 36 → 28.1.
    const seventh = await json<AgeOfMoney>(await get("2026-10-07"));
    expect(seventh.current).toBe(28);
    // Thirty days after 10-07: then 28, now 31.
    const later = await json<AgeOfMoney>(await get("2026-11-06"));
    expect(later).toMatchObject({ current: 31, thirtyDaysAgo: 28 });
    expect(later.months.at(-1)).toEqual({ month: "2026-11", days: 31 });
  });

  it("is empty for a budget without transactions, and 404 for a non-member", async () => {
    const { get } = await setup();
    const { cookie } = await signUp(app, { email: "other@example.com" });
    expect((await get("2026-10-20", cookie)).status).toBe(404);
    const budget = await createBudget(app, cookie);
    const res = await send(
      "GET",
      `/v1/budgets/${budget.id}/reports/age-of-money?today=2026-10-20`,
      cookie,
    );
    expect(await json<AgeOfMoney>(res)).toEqual({
      asOf: "2026-10-20",
      current: null,
      thirtyDaysAgo: null,
      months: [],
    });
  });
});
