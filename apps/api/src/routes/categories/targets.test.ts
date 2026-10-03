import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBudget, createTestApp, resetDatabase, signUp } from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

type Target = {
  cadence: string;
  behavior: string;
  amount: string;
  dueDay: number | null;
  startMonth: string;
};
type Category = { id: string; name: string; target: Target | null };
type Group = { id: string; kind: string | null; categories: Category[] };
type Need = { needed: string; funded: string; underfunded: string } | null;
type Month = { categories: { categoryId: string; available: string; target: Need }[] };
type ErrorBody = { error: { code: string } };

const TODAY = "2026-10-02";

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
      date: "2026-08-20",
    }),
  );
  const groups = async () =>
    (await json<{ groups: Group[] }>(await send("GET", `${base}/categories`, cookie))).groups;
  const [bills] = (await groups()).filter((g) => !g.kind);
  const [rent, phone] = bills?.categories ?? [];
  if (!rent || !phone) throw new Error("starter data missing");

  const setTarget = (categoryId: string, input: Record<string, unknown>) =>
    send("PUT", `${base}/categories/${categoryId}/target`, cookie, {
      cadence: "monthly",
      behavior: "set_aside",
      amount: "10000",
      dueDay: null,
      month: "2026-10",
      ...input,
    });
  const assign = (categoryId: string, m: string, assigned: string) =>
    send("PUT", `${base}/months/${m}/categories/${categoryId}`, cookie, {
      assigned,
      today: TODAY,
    });
  const spend = async (categoryId: string, date: string, amount: string) => {
    const res = await send("POST", `${base}/transactions`, cookie, {
      accountId: account.id,
      categoryId,
      date,
      amount,
    });
    expect(res.status).toBe(201);
  };
  const need = async (categoryId: string, m: string) => {
    const res = await send("GET", `${base}/months/${m}?today=${TODAY}`, cookie);
    expect(res.status).toBe(200);
    return (await json<Month>(res)).categories.find((c) => c.categoryId === categoryId)?.target;
  };
  const findCategory = async (id: string) =>
    (await groups()).flatMap((g) => g.categories).find((c) => c.id === id);
  return { cookie, base, rent, phone, setTarget, assign, spend, need, findCategory, groups };
}

describe("category targets", () => {
  it("creates, edits and removes a target", async () => {
    const { base, cookie, rent, setTarget, findCategory } = await setup();
    const created = await setTarget(rent.id, { dueDay: 15 });
    expect(created.status).toBe(200);
    expect((await json<Category>(created)).target).toEqual({
      cadence: "monthly",
      behavior: "set_aside",
      amount: "10000",
      dueDay: 15,
      startMonth: "2026-10",
    });
    expect((await findCategory(rent.id))?.target?.amount).toBe("10000");

    await setTarget(rent.id, { behavior: "refill", amount: "5000" });
    expect((await findCategory(rent.id))?.target).toMatchObject({
      behavior: "refill",
      amount: "5000",
      dueDay: null,
    });

    const removed = await send("DELETE", `${base}/categories/${rent.id}/target`, cookie);
    expect(removed.status).toBe(200);
    expect((await json<Category>(removed)).target).toBeNull();
    expect((await findCategory(rent.id))?.target).toBeNull();
  });

  it("starts in the month it's set from; saving from an earlier month moves the start back", async () => {
    const { rent, setTarget, findCategory } = await setup();
    await setTarget(rent.id, { month: "2026-11" });
    expect((await findCategory(rent.id))?.target?.startMonth).toBe("2026-11");
    await setTarget(rent.id, { month: "2026-12" });
    expect((await findCategory(rent.id))?.target?.startMonth).toBe("2026-11");
    await setTarget(rent.id, { month: "2026-09" });
    expect((await findCategory(rent.id))?.target?.startMonth).toBe("2026-09");
  });

  it("set aside counts this month's Assigned (YNAB T8 B, C, E)", async () => {
    const { rent, phone, setTarget, assign, spend, need } = await setup();
    await setTarget(rent.id, {});
    await setTarget(phone.id, {});
    await assign(rent.id, "2026-10", "4000");
    expect(await need(rent.id, "2026-10")).toEqual({
      needed: "10000",
      funded: "4000",
      underfunded: "6000",
    });
    await assign(rent.id, "2026-10", "10000");
    await spend(rent.id, "2026-10-01", "-3000");
    expect((await need(rent.id, "2026-10"))?.underfunded).toBe("0");
    // Money carried in from September doesn't count.
    await assign(phone.id, "2026-09", "7000");
    expect((await need(phone.id, "2026-10"))?.underfunded).toBe("10000");
  });

  it("refill counts carried money and Assigned, not spending or refunds (YNAB T8 G, H, J, M)", async () => {
    const { rent, phone, setTarget, assign, spend, need } = await setup();
    await setTarget(rent.id, { behavior: "refill" });
    await setTarget(phone.id, { behavior: "refill" });
    await assign(rent.id, "2026-09", "7000");
    await spend(rent.id, "2026-10-01", "-2000");
    expect(await need(rent.id, "2026-10")).toEqual({
      needed: "10000",
      funded: "7000",
      underfunded: "3000",
    });
    await assign(rent.id, "2026-10", "-2000");
    expect((await need(rent.id, "2026-10"))?.underfunded).toBe("5000");
    await assign(phone.id, "2026-10", "4000");
    await spend(phone.id, "2026-10-02", "2000");
    expect((await need(phone.id, "2026-10"))?.funded).toBe("4000");
  });

  it("ignores carried money in a future month and asks nothing before the start", async () => {
    const { rent, setTarget, assign, need } = await setup();
    await setTarget(rent.id, { behavior: "refill" });
    await assign(rent.id, "2026-10", "7000");
    expect((await need(rent.id, "2026-11"))?.funded).toBe("0");
    expect(await need(rent.id, "2026-09")).toBeNull();
  });

  it("refuses payment categories and invalid amounts", async () => {
    const { base, cookie, rent, setTarget, groups } = await setup();
    await send("POST", `${base}/accounts`, cookie, {
      name: "Visa",
      type: "credit_card",
      balance: "0",
      date: "2026-08-20",
    });
    const payment = (await groups()).find((g) => g.kind === "credit_card_payments")?.categories[0];
    if (!payment) throw new Error("payment category missing");
    const res = await setTarget(payment.id, {});
    expect(res.status).toBe(409);
    expect((await json<ErrorBody>(res)).error.code).toBe("MANAGED_CATEGORY");
    expect((await setTarget(rent.id, { amount: "0" })).status).toBe(400);
    expect((await setTarget(rent.id, { dueDay: 32 })).status).toBe(400);
  });

  it("is only for members", async () => {
    const { base, rent } = await setup();
    const other = await signUp(app, { email: "other@example.com" });
    const res = await send("PUT", `${base}/categories/${rent.id}/target`, other.cookie, {
      cadence: "monthly",
      behavior: "set_aside",
      amount: "100",
      dueDay: null,
      month: "2026-10",
    });
    expect(res.status).toBe(404);
  });
});
