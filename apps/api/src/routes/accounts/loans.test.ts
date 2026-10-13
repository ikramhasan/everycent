import { loanTerms } from "@everycent/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBudget, createTestApp, resetDatabase, signUp } from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

type Account = {
  id: string;
  name: string;
  interestRate: string | null;
  balances: { cleared: string; uncleared: string; working: string };
  pairedCategoryId: string | null;
  lastPaymentDate: string | null;
};
type Charge = { total: string; applied: string; status: string; editedAt: string | null };
type LoanMonth = {
  month: string;
  startBalance: string;
  endBalance: string;
  payments: string;
  interest: Charge;
  escrow: Charge;
  transactions: Array<{ amount: string; kind: string; fromAccountId: string | null }>;
};
type Txn = {
  date: string;
  amount: string;
  payeeName: string | null;
  categoryName: string | null;
  cleared: string;
  memo: string;
};
type Group = {
  id: string;
  name: string;
  kind: string | null;
  categories: Array<{ id: string; name: string; internalKind?: string | null }>;
};

const TODAY = "2026-10-13";

function send(method: string, path: string, cookie: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** YNAB's "L7 Mortgage" (2026-10-13): $100,000 at 5.125%, $900 a month, $150 escrow, July 1. */
async function setup() {
  const { cookie } = await signUp(app);
  const budget = await createBudget(app, cookie);
  const base = `/v1/budgets/${budget.id}`;
  const addAccount = async (input: Record<string, unknown>): Promise<Account> => {
    const res = await send("POST", `${base}/accounts`, cookie, { date: "2026-07-01", ...input });
    expect(res.status, await res.clone().text()).toBe(201);
    return (await res.json()) as Account;
  };
  const groups = async () =>
    ((await (await send("GET", `${base}/categories`, cookie)).json()) as { groups: Group[] })
      .groups;
  const bills = (await groups()).find((g) => g.kind === null && g.categories.length > 0);
  const payCategory = bills?.categories[0];
  if (!payCategory) throw new Error("No category to pair");
  const checking = await addAccount({ name: "L7 Chk", type: "checking", balance: "2000000" });
  const mortgage = await addAccount({
    name: "L7 Mortgage",
    type: "mortgage",
    balance: "-10000000",
    interestRate: "5.125",
    minimumPayment: "90000",
    escrowAmount: "15000",
    pairedCategoryId: payCategory.id,
  });
  const account = async (id: string) =>
    (
      (await (await send("GET", `${base}/accounts?today=${TODAY}`, cookie)).json()) as {
        accounts: Account[];
      }
    ).accounts.find((a) => a.id === id);
  const pay = async (date: string, amount: string, memo = "", loanId = mortgage.id) => {
    const res = await send("POST", `${base}/accounts/${loanId}/loan/payments`, cookie, {
      fromAccountId: checking.id,
      amount,
      date,
      memo,
    });
    expect(res.status, await res.clone().text()).toBe(201);
  };
  const months = async (loanId = mortgage.id) => {
    const res = await send("GET", `${base}/accounts/${loanId}/loan?today=${TODAY}`, cookie);
    expect(res.status, await res.clone().text()).toBe(200);
    return ((await res.json()) as { months: LoanMonth[] }).months;
  };
  const setCharge = (month: string, kind: string, amount: string, loanId = mortgage.id) =>
    send("PUT", `${base}/accounts/${loanId}/loan/charges`, cookie, {
      month,
      kind,
      amount,
      today: TODAY,
    });
  const transactions = async (accountId: string) =>
    (
      (await (await send("GET", `${base}/transactions?accountId=${accountId}`, cookie)).json()) as {
        transactions: Txn[];
      }
    ).transactions;
  return {
    cookie,
    base,
    addAccount,
    groups,
    payCategory,
    checking,
    mortgage,
    account,
    pay,
    months,
    setCharge,
    transactions,
  };
}

describe("loan activity (YNAB, 2026-10-13)", () => {
  it("charges escrow and interest on the months with payments", async () => {
    const { mortgage, checking, payCategory, account, pay, months, transactions } = await setup();
    await pay("2026-08-05", "90000", "x-aug");
    await pay("2026-09-05", "90000");
    await pay("2026-09-20", "50000");

    const all = await months();
    expect(all.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    const [jul, aug, sep, oct] = all;
    expect(jul?.interest.applied).toBe("0");
    expect(aug).toMatchObject({
      payments: "90000",
      interest: { total: "42708", applied: "42708", status: "estimated" },
      escrow: { total: "15000", applied: "15000", status: "estimated" },
      endBalance: "-9967708",
    });
    expect(sep).toMatchObject({ interest: { applied: "42570" }, endBalance: "-9885278" });
    expect(oct?.payments).toBe("0");
    expect(aug?.transactions).toEqual([
      expect.objectContaining({ amount: "90000", kind: "payment", fromAccountId: checking.id }),
    ]);

    // Payments are cleared on the loan's side; the charges aren't.
    expect((await account(mortgage.id))?.balances).toEqual({
      cleared: "-9770000",
      uncleared: "-115278",
      working: "-9885278",
    });
    expect((await account(mortgage.id))?.lastPaymentDate).toBe("2026-09-20");
    // The paying side comes out of the paired category, uncleared.
    expect((await transactions(checking.id)).find((t) => t.memo === "x-aug")).toMatchObject({
      amount: "-90000",
      payeeName: "Transfer : L7 Mortgage",
      categoryName: payCategory.name,
      cleared: "uncleared",
    });
  });

  it("rounds interest twice and lists the loan's terms (YNAB, L7 Half: $2,074.97 → $10.38)", async () => {
    const { base, cookie, addAccount, pay } = await setup();
    const half = await addAccount({
      name: "L7 Half",
      type: "personal_loan",
      balance: "-207497",
      interestRate: "6",
      minimumPayment: "100",
    });
    await pay("2026-08-10", "5000", "", half.id);
    const res = await send("GET", `${base}/accounts/${half.id}/loan?today=${TODAY}`, cookie);
    const body = (await res.json()) as {
      months: LoanMonth[];
      terms: Array<{ month: string; interestRate: string | null; minimumPayment: string | null }>;
    };
    // $10.37485 rounds to $10.375, then $10.38 (one rounding gave $10.37).
    expect(body.months[1]?.interest).toMatchObject({ total: "1038", applied: "1038" });
    expect(body.terms).toEqual([
      expect.objectContaining({ interestRate: "6.000", minimumPayment: "100", escrowAmount: null }),
    ]);
  });

  it("edits, deletes and adds to a month's interest and escrow", async () => {
    const { mortgage, account, pay, months, setCharge } = await setup();
    await pay("2026-09-05", "90000");

    expect((await setCharge("2026-09", "interest", "43000")).status).toBe(200);
    let sep = (await months())[2];
    expect(sep?.interest).toMatchObject({ total: "43000", applied: "43000", status: "edited" });
    expect(sep?.interest.editedAt).not.toBeNull();
    expect((await account(mortgage.id))?.balances.working).toBe(
      String(-10_000_000 + 90_000 - 43_000 - 15_000),
    );

    // Delete Interest stores $0, not the estimate.
    await setCharge("2026-09", "interest", "0");
    sep = (await months())[2];
    expect(sep?.interest).toMatchObject({ total: "0", applied: "0", status: "edited" });

    // A recorded amount applies without payments (YNAB's help center: accrued interest).
    await setCharge("2026-10", "interest", "1000");
    await setCharge("2026-10", "escrow", "500");
    const oct = (await months())[3];
    expect(oct?.interest.applied).toBe("1000");
    expect(oct?.escrow.applied).toBe("500");

    expect((await setCharge("2026-06", "interest", "100")).status).toBe(400);
    expect((await setCharge("2026-11", "interest", "100")).status).toBe(400);
    expect((await setCharge("2026-09", "interest", "-1")).status).toBe(400);
  });

  it("applies new terms from the month they're set in", async () => {
    const { base, cookie, mortgage, pay, months } = await setup();
    await pay("2026-09-05", "90000");
    await pay("2026-10-05", "90000");
    const res = await send("PATCH", `${base}/accounts/${mortgage.id}`, cookie, {
      interestRate: "6",
      date: TODAY,
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const [, , sep, oct] = await months();
    expect(sep?.interest.applied).toBe("42708"); // still 5.125% on $100,000
    // 6% on what September left: 100,000 − 900 + 427.08 + 150 = $99,677.08 → $498.39.
    expect(oct?.interest.applied).toBe("49839");
  });

  it("keeps a pre-7f loan's old terms for earlier months", async () => {
    const { base, cookie, mortgage, pay, months } = await setup();
    // Loans from before 7f have no loan_terms rows, only the account's columns.
    await db.delete(loanTerms).where(eq(loanTerms.accountId, mortgage.id));
    await pay("2026-09-05", "90000");
    await pay("2026-10-05", "90000");
    expect((await months())[2]?.interest.applied).toBe("42708");
    await send("PATCH", `${base}/accounts/${mortgage.id}`, cookie, {
      interestRate: "6",
      date: TODAY,
    });
    const [, , sep, oct] = await months();
    expect(sep?.interest.applied).toBe("42708"); // still 5.125%
    expect(oct?.interest.applied).toBe("49839"); // 6% from October
  });

  it("keeps escrow to mortgages", async () => {
    const { base, cookie, addAccount, mortgage } = await setup();
    const car = await addAccount({
      name: "Car",
      type: "auto_loan",
      balance: "-500000",
      escrowAmount: "1000",
    });
    expect((car as Account & { escrowAmount: string | null }).escrowAmount).toBeNull();
    const res = await send("PATCH", `${base}/accounts/${mortgage.id}`, cookie, {
      type: "personal_loan",
      date: TODAY,
    });
    expect(((await res.json()) as { escrowAmount: string | null }).escrowAmount).toBeNull();
  });

  it("fixes the charges at Update Balance", async () => {
    const { base, cookie, mortgage, pay, months, transactions } = await setup();
    await pay("2026-07-10", "50000");
    await pay("2026-09-05", "90000");
    const res = await send("POST", `${base}/accounts/${mortgage.id}/reconcile`, cookie, {
      balance: "-9900000",
      date: TODAY,
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const after = (await res.json()) as Account;
    expect(after.balances.working).toBe("-9900000");
    expect(after.balances.uncleared).toBe("0");
    expect((await transactions(mortgage.id)).every((t) => t.cleared === "reconciled")).toBe(true);

    const [jul, aug, sep] = await months();
    // July's capped interest is kept at what was applied; August had no payment, so no lines.
    expect(jul?.interest).toMatchObject({ applied: "35000", status: "reconciled" });
    expect(jul?.escrow).toMatchObject({ applied: "15000", status: "reconciled" });
    expect(aug?.interest.status).toBe("estimated");
    expect(sep?.interest.status).toBe("reconciled");

    // A new rate doesn't change reconciled months.
    await send("PATCH", `${base}/accounts/${mortgage.id}`, cookie, {
      interestRate: "12",
      date: TODAY,
    });
    expect((await months())[2]?.interest.applied).toBe(sep?.interest.applied);
  });

  it("pairs one loan per category", async () => {
    const {
      base,
      cookie,
      addAccount,
      groups,
      payCategory,
      mortgage,
      account,
      checking,
      pay,
      transactions,
    } = await setup();
    const neg = await addAccount({
      name: "L7 Neg",
      type: "personal_loan",
      balance: "-1000100",
      interestRate: "6",
      pairedCategoryId: payCategory.id,
    });
    // Pairing moves the category (YNAB: L7 Neg took L7 Mortgage's).
    expect(neg.pairedCategoryId).toBe(payCategory.id);
    expect((await account(mortgage.id))?.pairedCategoryId).toBeNull();

    // An unpaired loan's payments are Uncategorized.
    await pay("2026-09-05", "1000", "x-unpaired");
    expect(
      (await transactions(checking.id)).find((t) => t.memo === "x-unpaired")?.categoryName,
    ).toBe("Uncategorized");

    await addAccount({ name: "Visa", type: "credit_card", balance: "0" });
    const payment = (await groups()).find((g) => g.kind === "credit_card_payments")?.categories[0];
    expect(payment).toBeDefined();
    const patch = (id: string, body: Record<string, unknown>) =>
      send("PATCH", `${base}/accounts/${id}`, cookie, { date: TODAY, ...body });
    expect((await patch(neg.id, { pairedCategoryId: null })).status).toBe(200);
    expect((await account(neg.id))?.pairedCategoryId).toBeNull();
    expect((await patch(checking.id, { pairedCategoryId: payCategory.id })).status).toBe(400);
    expect((await patch(neg.id, { pairedCategoryId: payment?.id })).status).toBe(400);

    // Closing a loan unpairs it.
    await patch(neg.id, { pairedCategoryId: payCategory.id });
    await send("POST", `${base}/accounts/${neg.id}/close`, cookie, { date: TODAY });
    expect((await account(neg.id))?.pairedCategoryId).toBeNull();
  });

  it("caps the charges at the month's payments (YNAB's L7 Neg)", async () => {
    const { addAccount, pay, months } = await setup();
    const neg = await addAccount({
      name: "L7 Neg",
      type: "personal_loan",
      balance: "-1000100",
      interestRate: "6",
      minimumPayment: "2000",
      date: "2026-08-01",
    });
    await pay("2026-09-05", "2000", "", neg.id);
    expect((await months(neg.id))[1]).toMatchObject({
      interest: { total: "5001", applied: "2000" },
      endBalance: "-1000100",
    });
    await pay("2026-09-20", "10000", "", neg.id);
    expect((await months(neg.id))[1]?.endBalance).toBe("-993101");
  });

  it("refuses payments from off-budget accounts and to non-loans", async () => {
    const { base, cookie, addAccount, mortgage, checking } = await setup();
    const house = await addAccount({ name: "House", type: "asset", balance: "100" });
    const record = (loanId: string, fromAccountId: string, amount = "100") =>
      send("POST", `${base}/accounts/${loanId}/loan/payments`, cookie, {
        fromAccountId,
        amount,
        date: TODAY,
      });
    expect((await record(mortgage.id, house.id)).status).toBe(400);
    expect((await record(checking.id, checking.id)).status).toBe(400);
    expect((await record(mortgage.id, checking.id, "0")).status).toBe(400);
    expect((await send("GET", `${base}/accounts/${checking.id}/loan`, cookie)).status).toBe(400);
  });
});
