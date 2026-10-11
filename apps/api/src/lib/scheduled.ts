import { type Database, newId } from "@everycent/db";
import {
  budgetAccount,
  type ClearedState,
  category,
  type FlagColor,
  payee,
  scheduledSubTransaction,
  scheduledTransaction,
} from "@everycent/db/schema";
import {
  firstOccurrenceAfter,
  nextOccurrence,
  type ScheduleFrequency,
  type SearchSettings,
  type SearchTerm,
  usesCategory as usesAccountCategory,
} from "@everycent/engine";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import {
  type AccountRow,
  assertNotSelf,
  assertOpen,
  findAccount,
  insertOtherSide,
  resolveCategory,
  usesCategory,
} from "../routes/transactions/rules";
import {
  assertLinesAddUp,
  assertSplitAllowed,
  type LineInput,
  syncLines,
} from "../routes/transactions/splits";
import { AppError } from "./errors";
import { type Db, findOrCreatePayee, insertTransaction, transferPayeeId } from "./ledger";

export type ScheduleRow = typeof scheduledTransaction.$inferSelect;

/**
 * How an entered occurrence starts out, as YNAB enters it (checked 2026-10-11): uncleared, except
 * in cash accounts, where it's cleared. Each side of a transfer follows its own account.
 */
export function clearedOnEntry(account: AccountRow): ClearedState {
  return account.type === "cash" ? "cleared" : "uncleared";
}

async function scheduleLines(db: Db, scheduleIds: readonly string[]) {
  if (scheduleIds.length === 0) return [];
  return db
    .select({
      id: scheduledSubTransaction.id,
      scheduledTransactionId: scheduledSubTransaction.scheduledTransactionId,
      amount: scheduledSubTransaction.amount,
      payeeId: scheduledSubTransaction.payeeId,
      payeeName: payee.name,
      transferAccountId: payee.transferAccountId,
      categoryId: scheduledSubTransaction.categoryId,
      categoryName: category.name,
      memo: scheduledSubTransaction.memo,
    })
    .from(scheduledSubTransaction)
    .leftJoin(payee, eq(payee.id, scheduledSubTransaction.payeeId))
    .leftJoin(category, eq(category.id, scheduledSubTransaction.categoryId))
    .where(inArray(scheduledSubTransaction.scheduledTransactionId, [...scheduleIds]))
    .orderBy(asc(scheduledSubTransaction.sortOrder), asc(scheduledSubTransaction.id));
}

/** The account a payee transfers to, if it's a transfer payee. */
async function transferAccountOf(db: Db, payeeId: string | null) {
  if (!payeeId) return null;
  const [row] = await db
    .select({ transferAccountId: payee.transferAccountId })
    .from(payee)
    .where(eq(payee.id, payeeId));
  return row?.transferAccountId ?? null;
}

/**
 * Turns one occurrence of `schedule` into a transaction dated `date` (with its transfer's other
 * side and its split's lines), and returns the transaction's id. Due occurrences are entered
 * unapproved and Enter Now's approved, as YNAB does. A transfer into a closed account is still
 * entered (YNAB, 2026-10-11).
 */
export async function enterOccurrence(
  tx: Db,
  schedule: ScheduleRow,
  date: string,
  approved: boolean,
) {
  const { budgetId } = schedule;
  const account = await findAccount(tx, budgetId, schedule.accountId);
  const transferId = await transferAccountOf(tx, schedule.payeeId);
  const transferTo = transferId ? await findAccount(tx, budgetId, transferId) : null;
  const lines = await scheduleLines(tx, [schedule.id]);
  // A transfer's one category belongs to whichever side uses categories.
  const ownCategory = transferTo && !usesCategory(account, transferTo) ? null : schedule.categoryId;
  const id = await insertTransaction(tx, {
    budgetId,
    accountId: account.id,
    date,
    amount: schedule.amount,
    currency: account.currency,
    payeeId: schedule.payeeId,
    categoryId:
      lines.length > 0
        ? null
        : await resolveCategory(tx, budgetId, account, transferTo, ownCategory),
    memo: schedule.memo,
    cleared: clearedOnEntry(account),
    approved,
    flag: schedule.flag,
  });
  if (lines.length > 0) {
    await syncLines(
      tx,
      {
        budgetId,
        parentId: id,
        date,
        account,
        moved: false,
        counterpart: { cleared: clearedOnEntry, approved },
      },
      lines.map(
        (l): LineInput => ({
          amount: l.amount.toString(),
          payeeName: null,
          ...(l.transferAccountId
            ? { transferAccountId: l.transferAccountId }
            : { payeeId: l.payeeId }),
          categoryId: l.categoryId,
          memo: l.memo,
        }),
      ),
    );
  }
  if (transferTo) {
    await insertOtherSide(
      tx,
      { id, budgetId, date, amount: schedule.amount, memo: schedule.memo },
      account,
      transferTo,
      {
        categoryId: usesCategory(transferTo, account) ? schedule.categoryId : null,
        cleared: clearedOnEntry(transferTo),
        approved,
      },
    );
  }
  return id;
}

/** Moves the schedule to its occurrence after `current`; a one-off is done and deleted. */
async function advance(tx: Db, schedule: ScheduleRow, current: string) {
  const next = nextOccurrence(schedule.frequency, schedule.dateFirst, current);
  if (next === null) {
    await tx.delete(scheduledTransaction).where(eq(scheduledTransaction.id, schedule.id));
  } else {
    await tx
      .update(scheduledTransaction)
      .set({ dateNext: next })
      .where(eq(scheduledTransaction.id, schedule.id));
  }
  return next;
}

/**
 * Enters every occurrence due by the user's `today` (YNAB enters each missed one, dated its own
 * date and unapproved; checked 2026-10-11) and moves each schedule past it. Idempotent and safe to
 * run from concurrent requests: due schedules are locked, and ones another request holds are
 * skipped (that request enters them). Schedules in closed accounts wait (EVERYCENT-115).
 */
export async function enterDueScheduled(db: Database, budgetId: string, today: string) {
  const due = and(
    eq(scheduledTransaction.budgetId, budgetId),
    lte(scheduledTransaction.dateNext, today),
    eq(budgetAccount.closed, false),
  );
  const [any] = await db
    .select({ id: scheduledTransaction.id })
    .from(scheduledTransaction)
    .innerJoin(budgetAccount, eq(budgetAccount.id, scheduledTransaction.accountId))
    .where(due)
    .limit(1);
  if (!any) return;
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ schedule: scheduledTransaction })
      .from(scheduledTransaction)
      .innerJoin(budgetAccount, eq(budgetAccount.id, scheduledTransaction.accountId))
      .where(due)
      .orderBy(asc(scheduledTransaction.dateNext), asc(scheduledTransaction.id))
      .for("update", { of: scheduledTransaction, skipLocked: true });
    for (const { schedule } of rows) {
      let date: string | null = schedule.dateNext;
      while (date !== null && date <= today) {
        await enterOccurrence(tx, schedule, date, false);
        date = await advance(tx, schedule, date);
      }
    }
  });
}

/** YNAB's Enter Now: the next occurrence, dated `today` and approved; the schedule moves on. */
export async function enterNow(tx: Db, schedule: ScheduleRow, today: string) {
  const id = await enterOccurrence(tx, schedule, today, true);
  await advance(tx, schedule, schedule.dateNext);
  return id;
}

/** A schedule as the API receives it (create, or the full state after an edit). */
export interface ScheduleInput {
  accountId: string;
  frequency: ScheduleFrequency;
  date: string;
  dateFirst: string;
  amount: bigint;
  payee: { name: string | null } | { id: string | null } | { transferAccountId: string };
  categoryId: string | null;
  memo: string;
  flag: FlagColor | null;
  /** A split's lines; null when it isn't split. */
  lines: LineInput[] | null;
}

/**
 * The category a schedule is stored with: its own account's, or for a transfer whose own side
 * takes none (tracking to budget), the other side's. Same rules as on transactions otherwise.
 */
async function scheduleCategory(
  db: Db,
  budgetId: string,
  account: AccountRow,
  transferTo: AccountRow | null,
  categoryId: string | null,
) {
  if (transferTo && !usesCategory(account, transferTo) && usesCategory(transferTo, account)) {
    return resolveCategory(db, budgetId, transferTo, account, categoryId);
  }
  return resolveCategory(db, budgetId, account, transferTo, categoryId);
}

/**
 * Checks `input` with the rules transactions follow and writes it, as a new schedule or over
 * `id`. New transfers need both accounts open; editing one that already points at a closed
 * account keeps it.
 */
export async function writeSchedule(
  tx: Db,
  budgetId: string,
  input: ScheduleInput,
  existing?: { id: string; transferAccountId: string | null; accountId: string },
) {
  const account = await findAccount(tx, budgetId, input.accountId);
  if (!existing || existing.accountId !== account.id) assertOpen(account);
  let transferTo: AccountRow | null = null;
  if ("transferAccountId" in input.payee) {
    transferTo = await findAccount(tx, budgetId, input.payee.transferAccountId);
    assertNotSelf(account, transferTo);
    if (existing?.transferAccountId !== transferTo.id) assertOpen(transferTo);
  }
  if (input.dateFirst > input.date) {
    throw new AppError(400, "BAD_REQUEST", "`dateFirst` can't be after `date`");
  }
  const lines = input.lines;
  if (lines) {
    if (transferTo) {
      throw new AppError(
        400,
        "SPLIT_NOT_ALLOWED",
        "A transfer can't be split. Make the split's lines transfers instead.",
      );
    }
    if (input.categoryId !== null) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "A split's categories go on its lines; give either `categoryId` or `subtransactions`",
      );
    }
    assertSplitAllowed(account);
    assertLinesAddUp(lines, input.amount);
  }
  const values = {
    budgetId,
    accountId: account.id,
    frequency: input.frequency,
    dateFirst: input.dateFirst,
    dateNext: input.date,
    amount: input.amount,
    currency: account.currency,
    payeeId: transferTo
      ? await transferPayeeId(tx, transferTo)
      : "id" in input.payee
        ? input.payee.id
        : "name" in input.payee && input.payee.name
          ? await findOrCreatePayee(tx, budgetId, input.payee.name)
          : null,
    categoryId: lines
      ? null
      : await scheduleCategory(tx, budgetId, account, transferTo, input.categoryId),
    memo: input.memo,
    flag: input.flag,
  };
  const id = existing?.id ?? newId();
  if (existing) {
    await tx.update(scheduledTransaction).set(values).where(eq(scheduledTransaction.id, id));
    await tx
      .delete(scheduledSubTransaction)
      .where(eq(scheduledSubTransaction.scheduledTransactionId, id));
  } else {
    await tx.insert(scheduledTransaction).values({ id, ...values });
  }
  for (const [index, line] of (lines ?? []).entries()) {
    let lineTo: AccountRow | null = null;
    if (line.transferAccountId) {
      lineTo = await findAccount(tx, budgetId, line.transferAccountId);
      assertNotSelf(account, lineTo);
      assertOpen(lineTo);
    }
    await tx.insert(scheduledSubTransaction).values({
      id: newId(),
      scheduledTransactionId: id,
      sortOrder: index,
      amount: BigInt(line.amount),
      currency: account.currency,
      payeeId: lineTo
        ? await transferPayeeId(tx, lineTo)
        : line.payeeName
          ? await findOrCreatePayee(tx, budgetId, line.payeeName)
          : null,
      categoryId: await resolveCategory(tx, budgetId, account, lineTo, line.categoryId),
      memo: line.memo,
    });
  }
  return id;
}

/**
 * After a schedule is written with a date on or before `today`: YNAB enters that occurrence
 * (unapproved) and starts the schedule at its first date after today, skipping the ones between
 * (monthly from 9/01 added on 10/11: 9/01 entered, next 11/01; checked 2026-10-11). Returns the
 * entered transaction's id, or null if the date is still ahead.
 */
export async function enterIfPast(tx: Db, id: string, today: string) {
  const [schedule] = await tx
    .select()
    .from(scheduledTransaction)
    .where(eq(scheduledTransaction.id, id))
    .for("update");
  if (!schedule || schedule.dateNext > today) return null;
  const entered = await enterOccurrence(tx, schedule, schedule.dateNext, false);
  const next = firstOccurrenceAfter(schedule.frequency, schedule.dateFirst, today);
  if (next === null) {
    await tx.delete(scheduledTransaction).where(eq(scheduledTransaction.id, id));
  } else {
    await tx
      .update(scheduledTransaction)
      .set({ dateNext: next })
      .where(eq(scheduledTransaction.id, id));
  }
  return entered;
}

/** How a register row relates to its schedule. */
export type ScheduledRowKind = "schedule" | "transfer" | "splitTransfer";

/**
 * Every row the registers show for the budget's schedules (or one account's): each schedule in
 * its own account, plus, as YNAB shows them, a scheduled transfer in the other account (amount
 * negated, "Transfer : <account>") and a split's transfer line in its account. Newest first.
 */
export async function scheduledRows(db: Db, budgetId: string, accountId?: string) {
  const ownAccount = budgetAccount;
  const rows = await db
    .select({
      schedule: scheduledTransaction,
      accountName: ownAccount.name,
      accountType: ownAccount.type,
      payeeName: payee.name,
      transferAccountId: payee.transferAccountId,
      categoryName: category.name,
    })
    .from(scheduledTransaction)
    .innerJoin(ownAccount, eq(ownAccount.id, scheduledTransaction.accountId))
    .leftJoin(payee, eq(payee.id, scheduledTransaction.payeeId))
    .leftJoin(category, eq(category.id, scheduledTransaction.categoryId))
    .where(eq(scheduledTransaction.budgetId, budgetId));
  const lines = await scheduleLines(
    db,
    rows.map((r) => r.schedule.id),
  );
  const accounts = new Map(
    (
      await db
        .select({ id: budgetAccount.id, name: budgetAccount.name, type: budgetAccount.type })
        .from(budgetAccount)
        .where(eq(budgetAccount.budgetId, budgetId))
    ).map((a) => [a.id, a]),
  );
  const out = [];
  for (const row of rows) {
    const s = row.schedule;
    const own = lines.filter((l) => l.scheduledTransactionId === s.id);
    const base = {
      scheduledTransactionId: s.id,
      frequency: s.frequency,
      dateFirst: s.dateFirst,
      dateNext: s.dateNext,
      currency: s.currency,
      flag: s.flag,
    };
    const other = row.transferAccountId ? accounts.get(row.transferAccountId) : undefined;
    const ownCategoryShown =
      !other || usesAccountCategory(row.accountType, other.type) ? s.categoryId : null;
    out.push({
      ...base,
      id: s.id,
      kind: "schedule" as ScheduledRowKind,
      accountId: s.accountId,
      accountName: row.accountName,
      amount: s.amount,
      payeeId: s.payeeId,
      payeeName: row.payeeName,
      categoryId: ownCategoryShown,
      categoryName: ownCategoryShown ? row.categoryName : null,
      memo: s.memo,
      transferAccountId: row.transferAccountId,
      subtransactions: own.map(({ scheduledTransactionId: _, ...l }) => ({
        ...l,
        amount: l.amount.toString(),
      })),
    });
    if (other) {
      const shown = usesAccountCategory(other.type, row.accountType) ? s.categoryId : null;
      out.push({
        ...base,
        id: `${s.id}~${other.id}`,
        kind: "transfer" as ScheduledRowKind,
        accountId: other.id,
        accountName: other.name,
        amount: -s.amount,
        payeeId: null,
        payeeName: `Transfer : ${row.accountName}`,
        categoryId: shown,
        categoryName: shown ? row.categoryName : null,
        memo: s.memo,
        transferAccountId: s.accountId,
        subtransactions: [],
      });
    }
    for (const line of own) {
      const to = line.transferAccountId ? accounts.get(line.transferAccountId) : undefined;
      if (!to) continue;
      out.push({
        ...base,
        flag: null,
        id: `${s.id}~${line.id}`,
        kind: "splitTransfer" as ScheduledRowKind,
        accountId: to.id,
        accountName: to.name,
        amount: -line.amount,
        payeeId: null,
        payeeName: `Transfer : ${row.accountName}`,
        categoryId: null,
        categoryName: null,
        memo: line.memo,
        transferAccountId: s.accountId,
        subtransactions: [],
      });
    }
  }
  return out
    .filter((r) => !accountId || r.accountId === accountId)
    .sort(
      (a, b) =>
        b.dateNext.localeCompare(a.dateNext) ||
        // A day's largest outflow on top, as the register sorts.
        (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0) ||
        a.id.localeCompare(b.id),
    )
    .map((r) => ({ ...r, amount: r.amount.toString() }));
}

export type ScheduledRowJson = Awaited<ReturnType<typeof scheduledRows>>[number];

/** The flag colors whose budget name is `name` (lower case), for `Flag:` search terms. */
export type FlagNames = ReadonlyMap<string, string>;

function contains(value: string | null, text: string) {
  return value?.toLowerCase().includes(text.toLowerCase()) ?? false;
}

/**
 * YNAB's register search over a scheduled row (or one of its split lines), as `termWhere` does it
 * for transactions. Scheduled rows count as uncleared (YNAB, 2026-10-11).
 */
export function scheduledRowMatches(
  row: ScheduledRowJson,
  terms: readonly SearchTerm[],
  flagNames: FlagNames,
) {
  type Unit = {
    payee: string | null;
    category: string | null;
    memo: string;
    amount: bigint;
    split: boolean;
  };
  const units: Unit[] = [
    {
      payee: row.payeeName,
      category: row.categoryName,
      memo: row.memo,
      amount: BigInt(row.amount),
      split: row.subtransactions.length > 0,
    },
    ...row.subtransactions.map((l) => ({
      payee: l.payeeName ?? row.payeeName,
      category: l.categoryName,
      memo: l.memo,
      amount: BigInt(l.amount),
      split: false,
    })),
  ];
  const matches = (unit: Unit, term: SearchTerm): boolean => {
    switch (term.kind) {
      case "text":
        return (
          contains(unit.payee, term.text) ||
          contains(unit.category, term.text) ||
          contains(unit.memo, term.text) ||
          contains(row.accountName, term.text) ||
          (term.amount !== null && (unit.amount < 0n ? -unit.amount : unit.amount) === term.amount)
        );
      case "payee":
        return contains(unit.payee, term.text);
      case "category":
        return contains(unit.category, term.text);
      case "memo":
        return contains(unit.memo, term.text);
      case "account":
        return contains(row.accountName, term.text);
      case "split":
        return unit.split;
      case "flag": {
        const text = term.text.toLowerCase();
        if (text === "none") return row.flag === null;
        return row.flag === text || (row.flag !== null && flagNames.get(text) === row.flag);
      }
      case "is":
        return term.state === "uncleared" || term.state === "unreconciled";
      case "amount": {
        const signed = term.direction === "outflow" ? -unit.amount : unit.amount;
        if (signed <= 0n) return false;
        return term.op === "eq"
          ? signed === term.amount
          : term.op === "gte"
            ? signed >= term.amount
            : signed <= term.amount;
      }
      case "date":
        return term.op === "on"
          ? row.dateNext === term.date
          : term.op === "before"
            ? row.dateNext <= term.date
            : row.dateNext >= term.date;
    }
  };
  return units.some((unit) => terms.every((term) => matches(unit, term)));
}

export type { SearchSettings };
