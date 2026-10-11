import { flagName, payee, scheduledTransaction } from "@everycent/db/schema";
import { parseSearch } from "@everycent/engine";
import type { RouteHandler } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { loadBudgetAccess } from "../../lib/budget-access";
import { AppError } from "../../lib/errors";
import { type Db, serverToday } from "../../lib/ledger";
import {
  enterDueScheduled,
  enterIfPast,
  enterNow,
  type ScheduleInput,
  scheduledRowMatches,
  scheduledRows,
  writeSchedule,
} from "../../lib/scheduled";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import { deleteWithTransfers } from "../transactions/handlers";
import { queryRegisterRow } from "../transactions/register-query";
import {
  assertOnePayee,
  findAccount,
  lockTransaction,
  transferInSplit,
  usesCategory,
} from "../transactions/rules";
import type { LineInput } from "../transactions/splits";
import type {
  createScheduledTransaction,
  deleteScheduledTransaction,
  enterScheduledTransaction,
  listScheduledTransactions,
  updateScheduledTransaction,
} from "./routes";

type Env = AppEnv & AuthedEnv;

/** The schedule's row in its own account, as the register shows it. */
async function scheduleJson(db: Db, budgetId: string, id: string) {
  const rows = await scheduledRows(db, budgetId);
  return rows.find((r) => r.id === id) ?? null;
}

async function lockSchedule(tx: Db, budgetId: string, id: string) {
  const [row] = await tx
    .select({ schedule: scheduledTransaction, transferAccountId: payee.transferAccountId })
    .from(scheduledTransaction)
    .leftJoin(payee, eq(payee.id, scheduledTransaction.payeeId))
    .where(and(eq(scheduledTransaction.id, id), eq(scheduledTransaction.budgetId, budgetId)))
    .for("update", { of: scheduledTransaction });
  if (!row) throw new AppError(404, "NOT_FOUND", "Scheduled transaction not found");
  return row;
}

export const listScheduledTransactionsHandler: RouteHandler<
  typeof listScheduledTransactions,
  Env
> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const { accountId, q, from, to, today = serverToday() } = c.req.valid("query");
  const { db } = c.var.deps;
  const { budget } = await loadBudgetAccess(c, budgetId);
  await enterDueScheduled(db, budgetId, today);
  const terms = q ? parseSearch(q, budget) : [];
  const names = await db
    .select({ color: flagName.color, name: flagName.name })
    .from(flagName)
    .where(eq(flagName.budgetId, budgetId));
  const flagNames = new Map(names.map((n) => [n.name.toLowerCase(), n.color]));
  const rows = (await scheduledRows(db, budgetId, accountId)).filter(
    (r) =>
      (!from || r.dateNext >= from) &&
      (!to || r.dateNext <= to) &&
      (terms.length === 0 || scheduledRowMatches(r, terms, flagNames)),
  );
  return c.json({ scheduledTransactions: rows }, 200);
};

export const createScheduledTransactionHandler: RouteHandler<
  typeof createScheduledTransaction,
  Env
> = async (c) => {
  const { budgetId } = c.req.valid("param");
  const body = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["create"] });
  assertOnePayee(body);
  const today = body.today ?? serverToday();
  const result = await db.transaction(async (tx) => {
    if (body.fromTransactionId) {
      const existing = await lockTransaction(tx, budgetId, body.fromTransactionId);
      if (!existing) throw new AppError(404, "NOT_FOUND", "Transaction not found");
      if (existing.transferSubTransactionId) transferInSplit();
      await deleteWithTransfers(tx, existing);
    }
    const id = await writeSchedule(tx, budgetId, {
      accountId: body.accountId,
      frequency: body.frequency,
      date: body.date,
      dateFirst: body.dateFirst ?? body.date,
      amount: BigInt(body.amount),
      payee: body.transferAccountId
        ? { transferAccountId: body.transferAccountId }
        : { name: body.payeeName },
      categoryId: body.categoryId,
      memo: body.memo,
      flag: body.flag,
      lines: body.subtransactions ?? null,
    });
    return { id, entered: await enterIfPast(tx, id, today) };
  });
  return c.json(
    {
      scheduledTransaction: await scheduleJson(db, budgetId, result.id),
      enteredTransactionId: result.entered,
    },
    201,
  );
};

export const updateScheduledTransactionHandler: RouteHandler<
  typeof updateScheduledTransaction,
  Env
> = async (c) => {
  const { budgetId, scheduledTransactionId: id } = c.req.valid("param");
  const body = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["update"] });
  assertOnePayee(body);
  const today = body.today ?? serverToday();
  const entered = await db.transaction(async (tx) => {
    const { schedule, transferAccountId } = await lockSchedule(tx, budgetId, id);
    const rows = await scheduledRows(tx, budgetId, schedule.accountId);
    const lines = rows.find((r) => r.id === id)?.subtransactions ?? [];
    const accountId = body.accountId ?? schedule.accountId;
    const payeeInput: ScheduleInput["payee"] = body.transferAccountId
      ? { transferAccountId: body.transferAccountId }
      : body.payeeName !== undefined
        ? { name: body.payeeName }
        : transferAccountId
          ? { transferAccountId }
          : { id: schedule.payeeId };
    const retargeted =
      ("transferAccountId" in payeeInput ? payeeInput.transferAccountId : null) !==
      transferAccountId;
    // A split stays one until it gets a category (or becomes a transfer), as transactions do.
    const keptLines: LineInput[] | null =
      body.subtransactions ??
      (lines.length > 0 && body.categoryId === undefined && !("transferAccountId" in payeeInput)
        ? lines.map((l) => ({
            amount: l.amount,
            payeeName: l.transferAccountId ? null : l.payeeName,
            ...(l.transferAccountId ? { transferAccountId: l.transferAccountId } : {}),
            categoryId: l.categoryId,
            memo: l.memo,
          }))
        : null);
    let categoryId = body.categoryId !== undefined ? body.categoryId : schedule.categoryId;
    if (keptLines) categoryId = null;
    else if (body.categoryId === undefined && (accountId !== schedule.accountId || retargeted)) {
      // Keep the category where it can still be used, otherwise fall back.
      const account = await findAccount(tx, budgetId, accountId);
      const target =
        "transferAccountId" in payeeInput
          ? await findAccount(tx, budgetId, payeeInput.transferAccountId)
          : null;
      const usable =
        usesCategory(account, target) || (target !== null && usesCategory(target, account));
      if (!usable) categoryId = null;
    }
    const date = body.date ?? schedule.dateNext;
    // A new date restarts the repeats there (YNAB resets date_first); a new frequency counts
    // from the date shown.
    const dateFirst =
      body.dateFirst ??
      (body.date !== undefined ||
      (body.frequency !== undefined && body.frequency !== schedule.frequency)
        ? date
        : schedule.dateFirst);
    await writeSchedule(
      tx,
      budgetId,
      {
        accountId,
        frequency: body.frequency ?? schedule.frequency,
        date,
        dateFirst,
        amount: body.amount !== undefined ? BigInt(body.amount) : schedule.amount,
        payee: payeeInput,
        categoryId,
        memo: body.memo ?? schedule.memo,
        flag: body.flag !== undefined ? body.flag : schedule.flag,
        lines: keptLines,
      },
      { id, accountId: schedule.accountId, transferAccountId },
    );
    return enterIfPast(tx, id, today);
  });
  return c.json(
    {
      scheduledTransaction: await scheduleJson(db, budgetId, id),
      enteredTransactionId: entered,
    },
    200,
  );
};

export const deleteScheduledTransactionHandler: RouteHandler<
  typeof deleteScheduledTransaction,
  Env
> = async (c) => {
  const { budgetId, scheduledTransactionId: id } = c.req.valid("param");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["delete"] });
  await db.transaction(async (tx) => {
    await lockSchedule(tx, budgetId, id);
    await tx.delete(scheduledTransaction).where(eq(scheduledTransaction.id, id));
  });
  return c.body(null, 204);
};

export const enterScheduledTransactionHandler: RouteHandler<
  typeof enterScheduledTransaction,
  Env
> = async (c) => {
  const { budgetId, scheduledTransactionId: id } = c.req.valid("param");
  const { today = serverToday() } = c.req.valid("json");
  const { db } = c.var.deps;
  await loadBudgetAccess(c, budgetId, { transaction: ["create"] });
  const { transactionId, accountId } = await db.transaction(async (tx) => {
    const { schedule } = await lockSchedule(tx, budgetId, id);
    return {
      transactionId: await enterNow(tx, schedule, today),
      accountId: schedule.accountId,
    };
  });
  const transaction = await queryRegisterRow(db, budgetId, accountId, transactionId);
  if (!transaction) throw new Error("Entered transaction missing");
  return c.json({ transaction, scheduledTransaction: await scheduleJson(db, budgetId, id) }, 200);
};
