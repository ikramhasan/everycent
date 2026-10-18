import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBudget, createTestApp, resetDatabase, signUp } from "../../test/helpers";

const SERVER = "2026-10-18";
const MADE_UP = "9999-12-31";

const { app, db, close } = createTestApp({ serverDate: () => SERVER });
afterAll(close);

// EVERYCENT-246: a made-up `today` sets how far a loan's month-by-month charges run (and which
// months a plan lists), so every read that takes one holds it within a day of the server's date.
describe("a made-up today", () => {
  let cookie = "";
  let base = "";
  let loanId = "";
  const send = (method: string, path: string, body?: unknown) =>
    app.request(`${base}${path}`, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeAll(async () => {
    await resetDatabase(db);
    ({ cookie } = await signUp(app));
    const budget = await createBudget(app, cookie);
    base = `/v1/budgets/${budget.id}`;
    const res = await send("POST", "/accounts", {
      name: "Mortgage",
      type: "mortgage",
      balance: "-10000000",
      interestRate: "5.125",
      minimumPayment: "90000",
      date: "2026-07-01",
    });
    expect(res.status, await res.clone().text()).toBe(201);
    loanId = ((await res.json()) as { id: string }).id;
  });

  it("ends a loan's months at the server's month", async () => {
    const res = await send("GET", `/accounts/${loanId}/loan?today=${MADE_UP}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const { months } = (await res.json()) as { months: Array<{ month: string }> };
    expect(months.at(-1)?.month).toBe("2026-10");
  });

  it.each([
    ["the account list", "/accounts"],
    ["a budget month", "/months/2026-10"],
    ["the month's activity", "/months/2026-10/activity?uncategorized=true"],
    ["Age of Money", "/reports/age-of-money"],
    ["Budget vs Actual", "/reports/budget-vs-actual?from=2026-07&to=2026-10"],
    ["Spending Pace", "/reports/spending-pace"],
  ])("is held on %s", async (_name, path) => {
    const sep = path.includes("?") ? "&" : "?";
    const clamped = await send("GET", `${path}${sep}today=${MADE_UP}`);
    expect(clamped.status, await clamped.clone().text()).toBe(200);
    const edge = await send("GET", `${path}${sep}today=2026-10-19`);
    expect(await clamped.json()).toEqual(await edge.json());
  });
});
