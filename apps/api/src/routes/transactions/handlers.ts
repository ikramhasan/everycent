import {
  type ClearedState,
  type FlagColor,
  subTransaction,
  transaction,
} from "@everycent/db/schema";
import type { RouteHandler } from "@hono/zod-openapi";
import { eq, inArray } from "drizzle-orm";
import { type FxDeps, rebase, syncBases } from "../../lib/base-amount";
import { loadBudgetAccess } from "../../lib/budget-access";
import { assertNotFuture, latestTransactionDate } from "../../lib/dates";
import { AppError } from "../../lib/errors";
import { type Db, findOrCreatePayee, insertTransaction, transferPayeeId } from "../../lib/ledger";
import { setApproval } from "../../lib/review";
import { enterDueScheduled, entryDate } from "../../lib/scheduled";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import { parseSort, queryRegister, queryRegisterRow } from "./register-query";
import type {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from "./routes";
import {
  type AccountRow,
  assertOnePayee,
  assertOpen,
  assertSameCurrency,
  assertTransferPair,
  clearedOnEntry,
  findAccount,
  insertOtherSide,
  lockTransaction,
  reconciledStays,
  resolveCategory,
  type TransferSideInput,
  transferInSplit,
  usesCategory,
} from "./rules";
import {
  assertLinesAddUp,
  assertSplitAllowed,
  deleteLineTransfers,
  type LineInput,
  splitLines,
  syncLines,
} from "./splits";

type Env = AppEnv & AuthedEnv;
/**
 * How a register's search reads amounts: in its account's currency, or the budget's for all
 * accounts (where amounts in other currencies are read in the budget's; EVERYCENT-52 gap).
 */
export function searchSettings<S extends { currency: AccountRow["currency"] }>(
  budget: S,
  account: Pick<AccountRow, "currency"> | null,
): S {
  return account ? { ...budget, currency: account.currency } : budget;
}

async function transactionJson(db: Db, budgetId: string, accountId: string, id: string) {
  const row = await queryRegisterRow(db, budgetId, accountId, id);
  if (!row) throw new AppError(404, "NOT_FOUND", "Transaction not found");
  return row;
}

export const listTransactionsHandler: RouteHandler<typeof listTransactions, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const { sort, limit, cursor, today, ...filter } = c.req.valid("query");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId);
  // The first page enters what's come due, so the register is current.
  if (today && !cursor)
    await enterDueScheduled(db, c.var.deps, budgetId, entryDate(c.var.deps, today));
  const account = filter.accountId ? await findAccount(db, budgetId, filter.accountId) : null;
  const page = await queryRegister(
    db,
    budgetId,
    { ...filter, today },
    { sort: parseSort(sort), limit, cursor },
    searchSettings(budget, account),
  );
  return c.json(page, 200);
};

export const createTransactionHandler: RouteHandler<typeof createTransaction, Env> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const body = c.req.valid("json");
  const { today } = c.req.valid("query");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["create"] });
  // Future-dated entries are scheduled transactions (EVERYCENT-137). An undo restore brings a row
  // back as it was, so one dated ahead (older data, or the server's UTC + 1) isn't refused, as an
  // edit that keeps its date isn't.
  if (!body.restore) assertNotFuture(body.date, latestTransactionDate(c.var.deps, today));
  const id = await db.transaction((tx) => insertNewTransaction(tx, c.var.deps, budgetId, body));
  return c.json(await transactionJson(db, budgetId, body.accountId, id), 201);
};

/** What `createTransaction` takes. */
export interface CreateBody {
  accountId: string;
  date: string;
  amount: string;
  payeeName: string | null;
  transferAccountId?: string;
  categoryId: string | null;
  memo: string;
  subtransactions?: LineInput[];
  /** Left out: by the account (`clearedOnEntry`). */
  cleared?: ClearedState;
  flag: FlagColor | null;
  approved?: boolean;
  /** A restored transfer's other side, as it was. */
  transferSide?: TransferSideInput;
  /**
   * An undo bringing back a deleted transaction: its accounts may have been closed since. YNAB's
   * Undo restores a transfer into an account closed from elsewhere (2026-10-14).
   */
  restore?: boolean;
  /** In a foreign-currency account: the rate typed by hand (otherwise the date's). */
  fxRate?: string | null;
}

/** A new transaction (with its transfer's other side and its split's lines); returns its id. */
export async function insertNewTransaction(tx: Db, fx: FxDeps, budgetId: string, body: CreateBody) {
  assertOnePayee(body);
  const account = await findAccount(tx, budgetId, body.accountId);
  if (!body.restore) assertOpen(account);
  let transferTo: AccountRow | null = null;
  if (body.transferAccountId !== undefined) {
    transferTo = await findAccount(tx, budgetId, body.transferAccountId);
    assertTransferPair(account, transferTo);
    if (!body.restore) assertOpen(transferTo);
  } else if (body.transferSide) {
    throw new AppError(400, "BAD_REQUEST", "`transferSide` needs `transferAccountId`");
  }
  const amount = BigInt(body.amount);
  const split = body.subtransactions;
  if (split) {
    if (transferTo) notSplittable();
    if (body.categoryId !== null) categoryOnSplit();
    assertSplitAllowed(account);
    assertLinesAddUp(split, amount);
  }
  const id = await insertTransaction(tx, {
    budgetId,
    accountId: account.id,
    date: body.date,
    amount,
    currency: account.currency,
    fx,
    rate: body.fxRate,
    payeeId: transferTo
      ? await transferPayeeId(tx, transferTo)
      : body.payeeName
        ? await findOrCreatePayee(tx, budgetId, body.payeeName)
        : null,
    categoryId: split
      ? null
      : await resolveCategory(tx, budgetId, account, transferTo, body.categoryId),
    memo: body.memo,
    cleared: body.cleared ?? clearedOnEntry(account),
    flag: body.flag,
    approved: body.approved,
  });
  if (split) {
    await syncLines(
      tx,
      { budgetId, parentId: id, date: body.date, account, moved: false, restore: body.restore },
      split,
    );
  }
  if (transferTo) {
    await insertOtherSide(
      tx,
      { id, budgetId, date: body.date, amount, memo: body.memo },
      account,
      transferTo,
      body.transferSide ?? {},
    );
  }
  await syncBases(tx, id);
  return id;
}

export const updateTransactionHandler: RouteHandler<typeof updateTransaction, Env> = async (c) => {
  const { budgetId, transactionId } = c.req.valid("param");
  const body = c.req.valid("json");
  const { today } = c.req.valid("query");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["update"] });
  assertOnePayee(body);
  const latest = latestTransactionDate(c.var.deps, today);
  const accountId = await db.transaction((tx) =>
    applyUpdate(tx, c.var.deps, budgetId, transactionId, withApproval(body), latest),
  );
  return c.json(await transactionJson(db, budgetId, accountId, transactionId), 200);
};

/**
 * In YNAB saving an unapproved transaction's editor (its button reads "Approve") or clicking its
 * cleared state approves it; setting its flag doesn't (2026-10-16, EVERYCENT-65). So any change
 * but a flag approves, unless `approved` is given (an undo restoring it unapproved).
 */
function withApproval(body: UpdateBody): UpdateBody {
  if (body.approved !== undefined) return body;
  const edits = Object.entries(body).some(([key, value]) => key !== "flag" && value !== undefined);
  return edits ? { ...body, approved: true } : body;
}

/** What `updateTransaction` takes. */
export interface UpdateBody {
  accountId?: string;
  date?: string;
  amount?: string;
  payeeName?: string | null;
  transferAccountId?: string;
  categoryId?: string | null;
  memo?: string;
  cleared?: "uncleared" | "cleared";
  flag?: FlagColor | null;
  subtransactions?: LineInput[];
  /** A transfer's other side follows a change (YNAB approves both sides together). */
  approved?: boolean;
  /**
   * In a foreign-currency account: a rate typed by hand, or null to go back to the date's rate.
   * Left out, the rate stays (see `rebase`).
   */
  fxRate?: string | null;
}

/** One transaction's edit (as `updateTransaction` describes it); returns its account. */
export async function applyUpdate(
  tx: Db,
  fx: FxDeps,
  budgetId: string,
  transactionId: string,
  body: UpdateBody,
  /** The latest date it may be moved to (see `latestTransactionDate`); null for no limit. */
  latestDate: string | null = null,
) {
  const existing = await lockTransaction(tx, budgetId, transactionId);
  if (!existing) throw new AppError(404, "NOT_FOUND", "Transaction not found");
  // Only a new date is checked, so a row already dated ahead (from before EVERYCENT-137) can
  // still be edited.
  if (body.date !== undefined && body.date !== existing.date)
    assertNotFuture(body.date, latestDate);
  if (existing.cleared === "reconciled" && body.cleared !== undefined) reconciledStays();
  if (existing.transferSubTransactionId) {
    return updateSplitTransferSide(tx, budgetId, existing, body);
  }
  const other = existing.transferTransactionId
    ? await lockTransaction(tx, budgetId, existing.transferTransactionId)
    : undefined;

  const moved = body.accountId !== undefined && body.accountId !== existing.accountId;
  const account = await findAccount(tx, budgetId, body.accountId ?? existing.accountId);
  if (moved) {
    assertOpen(account);
    assertSameCurrency(await findAccount(tx, budgetId, existing.accountId), account, "move");
  }

  // The account the other side belongs in: unchanged unless the payee changes.
  const targetId =
    body.transferAccountId ?? (body.payeeName !== undefined ? null : (other?.accountId ?? null));
  const retargeted = targetId !== (other?.accountId ?? null);
  let transferTo: AccountRow | null = null;
  if (targetId !== null) {
    transferTo = await findAccount(tx, budgetId, targetId);
    assertTransferPair(account, transferTo);
    if (retargeted) {
      assertOpen(account);
      assertOpen(transferTo);
    }
  }

  const amount = body.amount === undefined ? existing.amount : BigInt(body.amount);
  // A reconciled other side follows the edit and stays reconciled, as in YNAB (2026-10-11): the
  // warning before saving is the client's.

  // A split stays one until it gets a category (or becomes a transfer); see `syncLines`.
  const existingLines = await splitLines(tx, transactionId);
  const wasSplit = existingLines.length > 0;
  const lines = body.subtransactions;
  if (lines && body.categoryId !== undefined) categoryOnSplit();
  const unsplit = wasSplit && !lines && (body.categoryId !== undefined || transferTo !== null);
  const split = lines !== undefined || (wasSplit && !unsplit);
  if (split) {
    if (transferTo) notSplittable();
    assertSplitAllowed(account);
    if (lines) assertLinesAddUp(lines, amount);
    else
      assertLinesAddUp(
        existingLines.map((l) => ({ amount: l.amount.toString() })),
        amount,
      );
  }

  let categoryId = existing.categoryId;
  if (split) {
    categoryId = null;
  } else if (body.categoryId !== undefined) {
    categoryId = await resolveCategory(tx, budgetId, account, transferTo, body.categoryId);
  } else if (moved || retargeted) {
    // Keep the category if it can still be used, otherwise fall back.
    const keep = usesCategory(account, transferTo) ? existing.categoryId : null;
    categoryId = await resolveCategory(tx, budgetId, account, transferTo, keep);
  }

  const base = await rebase(tx, fx, existing, {
    currency: account.currency,
    date: body.date ?? existing.date,
    amount,
    rate: body.fxRate,
  });
  await tx
    .update(transaction)
    .set({
      accountId: account.id,
      currency: account.currency,
      date: body.date,
      amount,
      ...base,
      payeeId: transferTo
        ? await transferPayeeId(tx, transferTo)
        : body.payeeName === undefined
          ? undefined
          : body.payeeName === null
            ? null
            : await findOrCreatePayee(tx, budgetId, body.payeeName),
      categoryId,
      memo: body.memo,
      cleared: body.cleared,
      flag: body.flag,
      approved: body.approved,
      transferTransactionId: transferTo ? undefined : null,
    })
    .where(eq(transaction.id, transactionId));
  if (body.approved !== undefined && body.approved !== existing.approved) {
    // The other sides follow, a split's transfer lines' counterparts included.
    await setApproval(tx, [transactionId], body.approved);
  }

  if (split || wasSplit) {
    await syncLines(
      tx,
      { budgetId, parentId: transactionId, date: body.date ?? existing.date, account, moved },
      unsplit ? [] : lines,
    );
  }

  if (other && !transferTo) {
    await tx.delete(transaction).where(eq(transaction.id, other.id));
  } else if (other && transferTo) {
    // Date, amount and memo are shared; cleared, flag and category stay per side. YNAB copies a
    // memo edit on either side to the other (2026-10-15, EVERYCENT-158); only a changed memo is
    // copied, so saving a row leaves a memo set apart by the bulk Memo action alone.
    const keep = usesCategory(transferTo, account) ? other.categoryId : null;
    await tx
      .update(transaction)
      .set({
        accountId: transferTo.id,
        currency: transferTo.currency,
        date: body.date,
        amount: -amount,
        payeeId: moved ? await transferPayeeId(tx, account) : undefined,
        categoryId:
          moved || retargeted
            ? await resolveCategory(tx, budgetId, transferTo, account, keep)
            : undefined,
        memo: body.memo !== undefined && body.memo !== existing.memo ? body.memo : undefined,
        // Approving one side approves the other (YNAB, 2026-10-16); an undo takes both back.
        approved:
          body.approved !== undefined && body.approved !== existing.approved
            ? body.approved
            : undefined,
      })
      .where(eq(transaction.id, other.id));
  } else if (transferTo) {
    await insertOtherSide(
      tx,
      {
        id: transactionId,
        budgetId,
        date: body.date ?? existing.date,
        amount,
        memo: body.memo ?? existing.memo,
      },
      account,
      transferTo,
    );
  }
  await syncBases(tx, transactionId);
  return account.id;
}

export const deleteTransactionHandler: RouteHandler<typeof deleteTransaction, Env> = async (c) => {
  const { budgetId, transactionId } = c.req.valid("param");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["delete"] });
  await db.transaction(async (tx) => {
    const existing = await lockTransaction(tx, budgetId, transactionId);
    if (!existing) throw new AppError(404, "NOT_FOUND", "Transaction not found");
    if (existing.transferSubTransactionId) transferInSplit();
    await deleteWithTransfers(tx, existing);
  });
  return c.body(null, 204);
};

/** Deletes a transaction with its transfer's other side, or a split with its lines' ones. */
export async function deleteWithTransfers(tx: Db, existing: typeof transaction.$inferSelect) {
  await deleteLineTransfers(tx, existing.id);
  const ids = [existing.id];
  if (existing.transferTransactionId) ids.push(existing.transferTransactionId);
  await tx.delete(transaction).where(inArray(transaction.id, ids));
}

function notSplittable(): never {
  throw new AppError(
    400,
    "SPLIT_NOT_ALLOWED",
    "A transfer can't be split. Make the split's lines transfers instead.",
  );
}

function categoryOnSplit(): never {
  throw new AppError(
    400,
    "BAD_REQUEST",
    "A split's categories go on its lines; give either `categoryId` or `subtransactions`",
  );
}

/**
 * The other side of a split's transfer line: the split owns its date, amount, account and payee,
 * so only memo, cleared and (where one applies) the category change here. The memo is shared
 * with the line, as in YNAB (2026-10-15, EVERYCENT-158).
 */
async function updateSplitTransferSide(
  tx: Db,
  budgetId: string,
  existing: typeof transaction.$inferSelect,
  body: UpdateBody,
) {
  const locked =
    (body.accountId !== undefined && body.accountId !== existing.accountId) ||
    (body.date !== undefined && body.date !== existing.date) ||
    (body.amount !== undefined && BigInt(body.amount) !== existing.amount) ||
    body.payeeName !== undefined ||
    body.transferAccountId !== undefined ||
    body.subtransactions !== undefined;
  if (locked) transferInSplit();
  const account = await findAccount(tx, budgetId, existing.accountId);
  const [line] = await tx
    .select({ accountId: transaction.accountId })
    .from(subTransaction)
    .innerJoin(transaction, eq(transaction.id, subTransaction.transactionId))
    .where(eq(subTransaction.id, existing.transferSubTransactionId ?? ""));
  const splitAccount = line ? await findAccount(tx, budgetId, line.accountId) : null;
  await tx
    .update(transaction)
    .set({
      categoryId:
        body.categoryId === undefined
          ? undefined
          : await resolveCategory(tx, budgetId, account, splitAccount, body.categoryId),
      memo: body.memo,
      cleared: body.cleared,
      flag: body.flag,
      approved: body.approved,
    })
    .where(eq(transaction.id, existing.id));
  if (body.approved !== undefined && body.approved !== existing.approved) {
    // Approving a split's transfer side approves the split (and its other transfer lines).
    await setApproval(tx, [existing.id], body.approved);
  }
  if (body.memo !== undefined && body.memo !== existing.memo && existing.transferSubTransactionId) {
    await tx
      .update(subTransaction)
      .set({ memo: body.memo })
      .where(eq(subTransaction.id, existing.transferSubTransactionId));
  }
  return account.id;
}
