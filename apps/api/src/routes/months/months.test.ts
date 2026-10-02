import { newId } from "@everycent/db";
import { categoryAssignment } from "@everycent/db/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBudget, createTestApp, resetDatabase, signUp } from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

type Totals = { assigned: string; activity: string; available: string };
type Month = {
  month: string;
  currency: string;
  firstMonth: string;
  lastMonth: string;
  categories: (Totals & { categoryId: string })[];
  groups: (Totals & { groupId: string })[];
  hidden: Totals;
  uncategorized: { activity: string; available: string } | null;
};
type Category = { id: string; name: string };
type Group = { id: string; kind: string | null; categories: Category[] };
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
  const savings = await json<{ id: string }>(
    await send("POST", `${base}/accounts`, cookie, {
      name: "Savings",
      type: "savings",
      balance: "0",
      date: "2026-08-20",
    }),
  );
  const { groups } = await json<{ groups: Group[] }>(
    await send("GET", `${base}/categories`, cookie),
  );
  const [bills, needs] = groups.filter((g) => !g.kind);
  const [rent, phone] = bills?.categories ?? [];
  const [groceries] = needs?.categories ?? [];
  if (!bills || !needs || !rent || !phone || !groceries) throw new Error("starter data missing");

  const spend = async (input: Record<string, unknown>) => {
    const res = await send("POST", `${base}/transactions`, cookie, {
      accountId: account.id,
      categoryId: null,
      ...input,
    });
    expect(res.status).toBe(201);
  };
  const assign = (categoryId: string, month: string, amount: bigint) =>
    db.insert(categoryAssignment).values({
      id: newId(),
      budgetId: budget.id,
      categoryId,
      month: `${month}-01`,
      amount,
      currency: "USD",
    });
  const month = async (m: string, today = TODAY) => {
    const res = await send("GET", `${base}/months/${m}?today=${today}`, cookie);
    expect(res.status).toBe(200);
    const body = await json<Month>(res);
    const byCategory = (id: string) => body.categories.find((c) => c.categoryId === id);
    const byGroup = (id: string) => body.groups.find((g) => g.groupId === id);
    return { ...body, byCategory, byGroup };
  };
  return {
    cookie,
    base,
    account,
    savings,
    bills,
    needs,
    rent,
    phone,
    groceries,
    spend,
    assign,
    month,
  };
}

const t = (assigned: string, activity: string, available: string) => ({
  assigned,
  activity,
  available,
});

describe("budget months", () => {
  it("adds up each category's activity in the month, split lines one by one", async () => {
    const { month, spend, rent, phone, groceries, bills, savings } = await setup();
    await spend({ date: "2026-10-01", amount: "-2500", categoryId: rent.id });
    await spend({ date: "2026-10-02", amount: "-500", categoryId: rent.id });
    await spend({
      date: "2026-10-02",
      amount: "-3000",
      subtransactions: [
        { amount: "-1000", categoryId: phone.id },
        { amount: "-2000", categoryId: groceries.id },
      ],
    });
    // Transfers between budget accounts have no category.
    await spend({ date: "2026-10-02", amount: "-9900", transferAccountId: savings.id });
    // Last month's spending isn't this month's activity.
    await spend({ date: "2026-09-30", amount: "-700", categoryId: phone.id });

    const oct = await month("2026-10");
    expect(oct.month).toBe("2026-10");
    expect(oct.currency).toBe("USD");
    expect(oct.byCategory(rent.id)).toMatchObject(t("0", "-3000", "-3000"));
    expect(oct.byCategory(phone.id)).toMatchObject(t("0", "-1000", "-1000"));
    expect(oct.byCategory(groceries.id)).toMatchObject(t("0", "-2000", "-2000"));
    expect(oct.byGroup(bills.id)).toMatchObject(t("0", "-4000", "-4000"));
    expect(oct.uncategorized).toBeNull();
  });

  it("leaves transactions dated after the user's today out", async () => {
    const { month, spend, rent } = await setup();
    await spend({ date: "2026-10-20", amount: "-2500", categoryId: rent.id });
    expect((await month("2026-10")).byCategory(rent.id)).toMatchObject(t("0", "0", "0"));
    expect((await month("2026-10", "2026-10-20")).byCategory(rent.id)).toMatchObject(
      t("0", "-2500", "-2500"),
    );
  });

  it("rolls available over and starts the month after overspending at zero", async () => {
    const { month, spend, assign, rent, phone } = await setup();
    await assign(rent.id, "2026-09", 10000n);
    await spend({ date: "2026-09-10", amount: "-2500", categoryId: rent.id });
    await spend({ date: "2026-09-10", amount: "-400", categoryId: phone.id });
    await assign(rent.id, "2026-10", 1000n);
    await spend({ date: "2026-10-01", amount: "-500", categoryId: rent.id });

    const sep = await month("2026-09");
    expect(sep.byCategory(rent.id)).toMatchObject(t("10000", "-2500", "7500"));
    expect(sep.byCategory(phone.id)).toMatchObject(t("0", "-400", "-400"));

    const oct = await month("2026-10");
    expect(oct.byCategory(rent.id)).toMatchObject(t("1000", "-500", "8000"));
    expect(oct.byCategory(phone.id)).toMatchObject(t("0", "0", "0"));

    // Future months carry what's left.
    expect((await month("2026-11")).byCategory(rent.id)).toMatchObject(t("0", "0", "8000"));
  });

  it("keeps hidden categories out of their group's totals", async () => {
    const { cookie, base, month, spend, rent, phone, groceries, bills, needs } = await setup();
    await spend({ date: "2026-10-01", amount: "-2500", categoryId: rent.id });
    await spend({ date: "2026-10-01", amount: "-100", categoryId: phone.id });
    await spend({ date: "2026-10-01", amount: "-40", categoryId: groceries.id });
    await send("PATCH", `${base}/categories/${rent.id}`, cookie, { hidden: true });
    await send("PATCH", `${base}/category-groups/${needs.id}`, cookie, { hidden: true });

    const oct = await month("2026-10");
    expect(oct.byGroup(bills.id)).toMatchObject(t("0", "-100", "-100"));
    expect(oct.hidden).toEqual(t("0", "-2540", "-2540"));
    // Hidden categories still have their own numbers.
    expect(oct.byCategory(rent.id)).toMatchObject(t("0", "-2500", "-2500"));
  });

  it("shows uncategorized spending only in months that have some", async () => {
    const { month, spend } = await setup();
    await spend({ date: "2026-10-01", amount: "-200" });
    expect((await month("2026-10")).uncategorized).toEqual({
      activity: "-200",
      available: "-200",
    });
    expect((await month("2026-11")).uncategorized).toBeNull();
  });

  it("runs from the month before the oldest transaction to the month after today's", async () => {
    const { month, assign, rent } = await setup();
    expect(await month("2026-10")).toMatchObject({ firstMonth: "2026-07", lastMonth: "2026-11" });
    // A month with money assigned (even $0) opens the one after it.
    await assign(rent.id, "2026-11", 0n);
    expect(await month("2026-10")).toMatchObject({ lastMonth: "2026-12" });
  });

  it("lists every group, empty ones included, and no internal categories", async () => {
    const { cookie, base, month } = await setup();
    const group = await json<{ id: string }>(
      await send("POST", `${base}/category-groups`, cookie, { name: "Empty" }),
    );
    const oct = await month("2026-10");
    expect(oct.byGroup(group.id)).toMatchObject(t("0", "0", "0"));
    const { groups } = await json<{ groups: Group[] }>(
      await send("GET", `${base}/categories`, cookie),
    );
    const listed = groups.flatMap((g) => g.categories.map((c) => c.id)).sort();
    expect(oct.categories.map((c) => c.categoryId).sort()).toEqual(listed);
  });

  it("refuses bad months and non-members", async () => {
    const { cookie, base } = await setup();
    const bad = await send("GET", `${base}/months/2026-13`, cookie);
    expect(bad.status).toBe(400);
    const other = await signUp(app);
    const res = await send("GET", `${base}/months/2026-10`, other.cookie);
    expect(res.status).toBe(404);
    expect((await json<ErrorBody>(res)).error.code).toBe("NOT_FOUND");
  });
});
