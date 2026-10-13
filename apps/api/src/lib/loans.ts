import { newId } from "@everycent/db";
import { budgetAccount, loanCharge, loanTerms, payee, transaction } from "@everycent/db/schema";
import {
  ACCOUNT_TYPES,
  accountFamily,
  type BudgetMonth,
  type LoanChargeKind,
  type LoanChargeOverride,
  type LoanLine,
  type LoanMonth,
  type LoanTerms,
  loanMonths,
  monthOf,
} from "@everycent/engine";
import { and, asc, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "./ledger";

export const LOAN_TYPES = ACCOUNT_TYPES.filter((t) => accountFamily(t) === "loan");

type AccountRow = typeof budgetAccount.$inferSelect;

/** A loan transaction as the loan page shows it. */
export interface LoanTransaction {
  id: string;
  date: string;
  amount: bigint;
  memo: string;
  kind: LoanLine["kind"];
  /** Internal payee kind (balance adjustments), if any. */
  payeeKind: string | null;
  /** Payments: the account the money came from and that side's id. */
  fromAccountId: string | null;
  otherSideId: string | null;
}

export interface LoanState {
  months: LoanMonth[];
  transactions: LoanTransaction[];
  terms: LoanTerms[];
  /** `updatedAt` of each override, keyed "YYYY-MM:kind" (YNAB's "Edited on October 13"). */
  editedAt: Map<string, Date>;
}

const firstOfMonth = (month: BudgetMonth) => `${month}-01`;

/** The loans' transactions up to `today`, classified for `loanMonths`. */
async function loanTransactions(db: Db, accountIds: string[], today: string) {
  if (accountIds.length === 0) return [];
  const rows = await db
    .select({
      id: transaction.id,
      accountId: transaction.accountId,
      date: transaction.date,
      amount: transaction.amount,
      memo: transaction.memo,
      cleared: transaction.cleared,
      payeeKind: payee.internalKind,
      transferAccountId: payee.transferAccountId,
      transferTransactionId: transaction.transferTransactionId,
      transferSubTransactionId: transaction.transferSubTransactionId,
    })
    .from(transaction)
    .leftJoin(payee, eq(payee.id, transaction.payeeId))
    .where(and(inArray(transaction.accountId, accountIds), lte(transaction.date, today)))
    .orderBy(asc(transaction.date), asc(transaction.id));
  return rows.map((r) => {
    const transfer = r.transferTransactionId !== null || r.transferSubTransactionId !== null;
    const kind: LoanLine["kind"] =
      transfer && r.amount > 0n
        ? "payment"
        : r.payeeKind === "starting_balance"
          ? "starting_balance"
          : "other";
    return {
      accountId: r.accountId,
      cleared: r.cleared,
      line: {
        id: r.id,
        date: r.date,
        amount: r.amount,
        memo: r.memo,
        kind,
        payeeKind: r.payeeKind,
        fromAccountId: transfer ? r.transferAccountId : null,
        otherSideId: r.transferTransactionId,
      } satisfies LoanTransaction,
    };
  });
}

async function termsByAccount(db: Db, accounts: AccountRow[]) {
  const ids = accounts.map((a) => a.id);
  const rows = ids.length
    ? await db.select().from(loanTerms).where(inArray(loanTerms.accountId, ids))
    : [];
  const byAccount = new Map<string, LoanTerms[]>();
  for (const r of rows) {
    const list = byAccount.get(r.accountId) ?? [];
    list.push({
      month: monthOf(r.month),
      interestRate: r.interestRate,
      minimumPayment: r.minimumPayment,
      escrowAmount: r.escrowAmount,
    });
    byAccount.set(r.accountId, list);
  }
  // Loans from before 7f have only the account's columns: they apply to every month.
  for (const a of accounts) {
    if (!byAccount.has(a.id)) {
      byAccount.set(a.id, [
        {
          month: "0001-01",
          interestRate: a.interestRate,
          minimumPayment: a.minimumPayment,
          escrowAmount: a.escrowAmount,
        },
      ]);
    }
  }
  return byAccount;
}

async function overridesByAccount(db: Db, accountIds: string[]) {
  const rows = accountIds.length
    ? await db.select().from(loanCharge).where(inArray(loanCharge.accountId, accountIds))
    : [];
  type Entry = { overrides: LoanChargeOverride[]; editedAt: Map<string, Date> };
  const byAccount = new Map<string, Entry>();
  for (const r of rows) {
    const entry: Entry = byAccount.get(r.accountId) ?? { overrides: [], editedAt: new Map() };
    const month = monthOf(r.month);
    entry.overrides.push({ month, kind: r.kind, amount: r.amount, status: r.status });
    entry.editedAt.set(`${month}:${r.kind}`, r.updatedAt);
    byAccount.set(r.accountId, entry);
  }
  return byAccount;
}

/** Every loan's months through `today`'s month, keyed by account id. */
export async function loanStates(
  db: Db,
  accounts: AccountRow[],
  today: string,
): Promise<Map<string, LoanState>> {
  const loans = accounts.filter((a) => accountFamily(a.type) === "loan");
  const ids = loans.map((a) => a.id);
  const [lines, terms, overrides] = await Promise.all([
    loanTransactions(db, ids, today),
    termsByAccount(db, loans),
    overridesByAccount(db, ids),
  ]);
  const states = new Map<string, LoanState>();
  for (const loan of loans) {
    const own = lines.filter((l) => l.accountId === loan.id).map((l) => l.line);
    const accountTerms = terms.get(loan.id) ?? [];
    const accountOverrides = overrides.get(loan.id);
    states.set(loan.id, {
      months: loanMonths({
        lines: own,
        terms: accountTerms,
        overrides: accountOverrides?.overrides ?? [],
        through: monthOf(today),
      }),
      transactions: own,
      terms: accountTerms,
      editedAt: accountOverrides?.editedAt ?? new Map(),
    });
  }
  return states;
}

/**
 * What interest and escrow add to each loan's debt through `today`, split like balances: charges
 * fixed by a reconcile count as cleared, the rest as uncleared.
 */
export async function loanChargeBalances(db: Db, budgetId: string, today: string) {
  const loans = await db
    .select()
    .from(budgetAccount)
    .where(and(eq(budgetAccount.budgetId, budgetId), inArray(budgetAccount.type, LOAN_TYPES)));
  const states = await loanStates(db, loans, today);
  const result = new Map<string, { cleared: bigint; uncleared: bigint }>();
  for (const [accountId, state] of states) {
    let cleared = 0n;
    let uncleared = 0n;
    for (const m of state.months) {
      for (const charge of [m.interest, m.escrow]) {
        if (charge.status === "reconciled") cleared += charge.applied;
        else uncleared += charge.applied;
      }
    }
    if (cleared !== 0n || uncleared !== 0n) result.set(accountId, { cleared, uncleared });
  }
  return result;
}

/** Sets a month's interest or escrow total ("Edited on …"). */
export async function setLoanCharge(
  db: Db,
  account: AccountRow,
  input: {
    month: BudgetMonth;
    kind: LoanChargeKind;
    amount: bigint;
    status: "edited" | "reconciled";
  },
) {
  await db
    .insert(loanCharge)
    .values({
      id: newId(),
      accountId: account.id,
      month: firstOfMonth(input.month),
      kind: input.kind,
      amount: input.amount,
      currency: account.currency,
      status: input.status,
    })
    .onConflictDoUpdate({
      target: [loanCharge.accountId, loanCharge.month, loanCharge.kind],
      set: { amount: input.amount, status: input.status, updatedAt: sql`now()` },
    });
}

/**
 * Update Balance fixes every month's interest and escrow at what's applied, shown "Reconciled"
 * (YNAB, 2026-10-13: July's capped escrow stayed −$100.00; a month with nothing applied kept no
 * interest line).
 */
export async function freezeLoanCharges(db: Db, account: AccountRow, today: string) {
  const state = (await loanStates(db, [account], today)).get(account.id);
  for (const m of state?.months ?? []) {
    for (const kind of ["interest", "escrow"] as const) {
      const charge = m[kind];
      if (charge.status === "estimated" && charge.applied === 0n) continue;
      await setLoanCharge(db, account, {
        month: m.month,
        kind,
        amount: charge.applied,
        status: "reconciled",
      });
    }
  }
}

/** Records the loan's terms from `today`'s month on, replacing that month's entry. */
export async function saveLoanTerms(
  db: Db,
  account: Pick<AccountRow, "id" | "currency" | "interestRate" | "minimumPayment" | "escrowAmount">,
  today: string,
) {
  const values = {
    interestRate: account.interestRate,
    minimumPayment: account.minimumPayment,
    escrowAmount: account.escrowAmount,
  };
  await db
    .insert(loanTerms)
    .values({
      id: newId(),
      accountId: account.id,
      month: firstOfMonth(monthOf(today)),
      currency: account.currency,
      ...values,
    })
    .onConflictDoUpdate({ target: [loanTerms.accountId, loanTerms.month], set: values });
}

/** The date of each loan's latest payment, for the paired category's "Last Paid on …". */
export async function lastLoanPayments(db: Db, budgetId: string, today: string) {
  const rows = await db
    .select({ accountId: transaction.accountId, date: sql<string>`max(${transaction.date})` })
    .from(transaction)
    .innerJoin(budgetAccount, eq(budgetAccount.id, transaction.accountId))
    .where(
      and(
        eq(transaction.budgetId, budgetId),
        inArray(budgetAccount.type, LOAN_TYPES),
        sql`${transaction.amount} > 0`,
        lte(transaction.date, today),
        or(
          isNotNull(transaction.transferTransactionId),
          isNotNull(transaction.transferSubTransactionId),
        ),
      ),
    )
    .groupBy(transaction.accountId);
  return new Map(rows.map((r) => [r.accountId, r.date]));
}
