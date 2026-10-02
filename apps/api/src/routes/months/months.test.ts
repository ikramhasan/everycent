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
  readyToAssign: string;
  assignedInFuture: string;
  futureMonths: { month: string; assigned: string }[];
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
  const put = (categoryId: string, m: string, assigned: string, today = TODAY) =>
    send("PUT", `${base}/months/${m}/categories/${categoryId}`, cookie, { assigned, today });
  const { readyToAssignCategoryId } = await json<{ readyToAssignCategoryId: string }>(
    await send("GET", `${base}/categories`, cookie),
  );
  return {
    cookie,
    base,
    put,
    readyToAssignCategoryId,
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

  describe("assigning and Ready to Assign", () => {
    // The budget starts with $1,000.00 of income (Checking's starting balance, August 20).
    it("starts with the budget's income ready to assign", async () => {
      const { month } = await setup();
      expect(await month("2026-10")).toMatchObject({
        readyToAssign: "100000",
        assignedInFuture: "0",
        futureMonths: [],
      });
    });

    it("assigns money, replacing the category's amount", async () => {
      const { put, month, rent, bills } = await setup();
      const res = await put(rent.id, "2026-10", "25000");
      expect(res.status).toBe(200);
      const body = await json<Month>(res);
      expect(body.readyToAssign).toBe("75000");
      expect(body.categories.find((c) => c.categoryId === rent.id)).toMatchObject(
        t("25000", "0", "25000"),
      );
      await put(rent.id, "2026-10", "10000");
      const oct = await month("2026-10");
      expect(oct.byCategory(rent.id)).toMatchObject(t("10000", "0", "10000"));
      expect(oct.byGroup(bills.id)).toMatchObject(t("10000", "0", "10000"));
      expect(oct.readyToAssign).toBe("90000");
      // What's left rolls into November; Ready to Assign stays.
      const nov = await month("2026-11");
      expect(nov.byCategory(rent.id)).toMatchObject(t("0", "0", "10000"));
      expect(nov.readyToAssign).toBe("90000");
    });

    it("takes last month's overspending out of this month", async () => {
      const { spend, month } = await setup();
      await spend({ date: "2026-09-10", amount: "-2500" });
      expect((await month("2026-09")).readyToAssign).toBe("100000");
      expect((await month("2026-10")).readyToAssign).toBe("97500");
    });

    it("counts money assigned in later months, without pushing a month below zero", async () => {
      const { put, month, rent, phone } = await setup();
      await put(rent.id, "2026-10", "5000");
      await put(phone.id, "2026-11", "2000");
      expect(await month("2026-10")).toMatchObject({
        readyToAssign: "93000",
        assignedInFuture: "2000",
        futureMonths: [{ month: "2026-11", assigned: "2000" }],
      });
      expect((await month("2026-11")).readyToAssign).toBe("93000");

      await put(phone.id, "2026-11", "120000");
      expect((await month("2026-10")).readyToAssign).toBe("0");
      // November assigned more than there is.
      expect((await month("2026-11")).readyToAssign).toBe("-25000");
    });

    it("leaves income dated after today out", async () => {
      const { spend, month, readyToAssignCategoryId } = await setup();
      await spend({ date: "2026-10-20", amount: "50000", categoryId: readyToAssignCategoryId });
      expect((await month("2026-10")).readyToAssign).toBe("100000");
      expect((await month("2026-10", "2026-10-20")).readyToAssign).toBe("150000");
    });

    it("keeps a month open after its money is taken back out", async () => {
      const { put, month, rent } = await setup();
      expect((await put(rent.id, "2026-11", "100")).status).toBe(200);
      expect((await month("2026-10")).lastMonth).toBe("2026-12");
      await put(rent.id, "2026-11", "0");
      expect((await month("2026-10")).lastMonth).toBe("2026-12");
    });

    it("refuses months the budget doesn't show, internal categories and outsiders", async () => {
      const { put, rent, readyToAssignCategoryId, base } = await setup();
      const late = await put(rent.id, "2026-12", "100");
      expect(late.status).toBe(400);
      expect((await json<ErrorBody>(late)).error.code).toBe("MONTH_OUT_OF_RANGE");
      expect((await put(rent.id, "2026-06", "100")).status).toBe(400);
      expect((await put(readyToAssignCategoryId, "2026-10", "100")).status).toBe(404);
      expect((await put(rent.id, "2026-10", "1.5")).status).toBe(400);
      const other = await signUp(app);
      const res = await send("PUT", `${base}/months/2026-10/categories/${rent.id}`, other.cookie, {
        assigned: "100",
      });
      expect(res.status).toBe(404);
    });
  });

  describe("moving money", () => {
    type Move = {
      kind: string;
      fromCategoryId: string | null;
      toCategoryId: string | null;
      month: string;
      amount: string;
      userName: string | null;
    };

    async function moveSetup() {
      const ctx = await setup();
      const move = (fromCategoryId: string, toCategoryId: string, amount: string, m = "2026-10") =>
        send("POST", `${ctx.base}/months/${m}/moves`, ctx.cookie, {
          fromCategoryId,
          toCategoryId,
          amount,
          today: TODAY,
        });
      const moves = async () =>
        (await json<{ moves: Move[] }>(await send("GET", `${ctx.base}/moves`, ctx.cookie))).moves;
      return { ...ctx, move, moves };
    }

    it("moves assigned money between categories", async () => {
      const { put, move, month, rent, phone } = await moveSetup();
      await put(rent.id, "2026-10", "5000");
      const res = await move(rent.id, phone.id, "1000");
      expect(res.status).toBe(200);
      const oct = await month("2026-10");
      expect(oct.byCategory(rent.id)).toMatchObject(t("4000", "0", "4000"));
      expect(oct.byCategory(phone.id)).toMatchObject(t("1000", "0", "1000"));
      expect(oct.readyToAssign).toBe("95000");
    });

    it("covers overspending, and moves money back to Ready to Assign", async () => {
      const { put, move, month, spend, rent, phone, readyToAssignCategoryId } = await moveSetup();
      await put(rent.id, "2026-10", "5000");
      await spend({ date: "2026-10-01", amount: "-1500", categoryId: phone.id });
      await move(rent.id, phone.id, "1500");
      expect((await month("2026-10")).byCategory(phone.id)).toMatchObject(t("1500", "-1500", "0"));
      await move(rent.id, readyToAssignCategoryId, "2000");
      const oct = await month("2026-10");
      expect(oct.byCategory(rent.id)).toMatchObject(t("1500", "0", "1500"));
      expect(oct.readyToAssign).toBe("97000");
      // And from Ready to Assign, as assigning does.
      await move(readyToAssignCategoryId, rent.id, "500");
      expect((await month("2026-10")).byCategory(rent.id)).toMatchObject(t("2000", "0", "2000"));
    });

    it("lists every change to assigned money, newest first", async () => {
      const { put, move, moves, rent, phone, readyToAssignCategoryId } = await moveSetup();
      await put(rent.id, "2026-10", "5000");
      await put(rent.id, "2026-10", "5000"); // unchanged: not a move
      await move(rent.id, phone.id, "1000");
      await move(phone.id, readyToAssignCategoryId, "400");
      await put(rent.id, "2026-10", "3000");
      expect(await moves()).toMatchObject([
        { kind: "removed", fromCategoryId: rent.id, toCategoryId: null, amount: "1000" },
        { kind: "removed", fromCategoryId: phone.id, toCategoryId: null, amount: "400" },
        { kind: "moved", fromCategoryId: rent.id, toCategoryId: phone.id, amount: "1000" },
        {
          kind: "assigned",
          fromCategoryId: null,
          toCategoryId: rent.id,
          month: "2026-10",
          amount: "5000",
          userName: "Test User",
        },
      ]);
    });

    it("refuses bad moves", async () => {
      const { move, rent, phone, readyToAssignCategoryId } = await moveSetup();
      expect((await move(rent.id, rent.id, "100")).status).toBe(400);
      expect((await move(rent.id, phone.id, "0")).status).toBe(400);
      expect((await move(rent.id, phone.id, "-5")).status).toBe(400);
      expect((await move(rent.id, phone.id, "100", "2027-05")).status).toBe(400);
      expect((await move(rent.id, "nope", "100")).status).toBe(404);
      // Ready to Assign to Ready to Assign isn't a move either.
      expect((await move(readyToAssignCategoryId, readyToAssignCategoryId, "1")).status).toBe(400);
    });

    it("takes a deleted category's assigned money along with its transactions", async () => {
      const { cookie, base, put, spend, month, rent, phone } = await moveSetup();
      await put(rent.id, "2026-09", "3000");
      await put(rent.id, "2026-10", "2000");
      await put(phone.id, "2026-10", "100");
      await spend({ date: "2026-10-01", amount: "-500", categoryId: rent.id });
      const res = await send(
        "DELETE",
        `${base}/categories/${rent.id}?reassignToCategoryId=${phone.id}`,
        cookie,
      );
      expect(res.status).toBe(204);
      const oct = await month("2026-10");
      expect(oct.byCategory(phone.id)).toMatchObject(t("2100", "-500", "4600"));
      expect(oct.readyToAssign).toBe("94900");
    });
  });
});
