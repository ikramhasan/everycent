import { newId } from "@everycent/db";
import { subTransaction, transaction } from "@everycent/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { AppError } from "../../lib/errors";
import { type Db, findOrCreatePayee, insertTransaction, transferPayeeId } from "../../lib/ledger";
import {
  type AccountRow,
  assertNotSelf,
  assertOpen,
  findAccount,
  reconciledOtherSide,
  resolveCategory,
  usesCategory,
} from "./rules";

/** A split line as the API receives it. */
export interface LineInput {
  /** An existing line of this split, to keep its transfer's other side. New lines leave it out. */
  id?: string;
  amount: string;
  payeeName: string | null;
  transferAccountId?: string;
  categoryId: string | null;
  memo: string;
}

/** A line to write: from the request, or kept as it is (`payeeName`/`memo` undefined). */
interface LineSpec {
  id?: string;
  amount: bigint;
  payeeName?: string | null;
  transferAccountId: string | null;
  categoryId: string | null;
  /** The category was asked for, so it's checked strictly rather than adjusted. */
  explicitCategory: boolean;
  memo?: string;
}

export function assertSplitAllowed(account: AccountRow) {
  if (!usesCategory(account, null)) {
    throw new AppError(
      400,
      "SPLIT_NOT_ALLOWED",
      "Only transactions in budget accounts can be split",
    );
  }
}

export function assertLinesAddUp(lines: readonly { amount: string }[], total: bigint) {
  const sum = lines.reduce((acc, l) => acc + BigInt(l.amount), 0n);
  if (sum !== total) {
    throw new AppError(
      400,
      "SPLIT_TOTAL_MISMATCH",
      "The split lines must add up to the transaction's amount",
    );
  }
}

export async function splitLines(db: Db, transactionId: string) {
  return db
    .select()
    .from(subTransaction)
    .where(eq(subTransaction.transactionId, transactionId))
    .orderBy(asc(subTransaction.sortOrder), asc(subTransaction.id));
}

/** The transactions in other accounts that transfer lines of these split lines created. */
async function lockCounterparts(db: Db, lineIds: readonly string[]) {
  if (lineIds.length === 0) return [];
  return db
    .select()
    .from(transaction)
    .where(inArray(transaction.transferSubTransactionId, [...lineIds]))
    .for("update");
}

/**
 * Brings a split's lines in line with `input` (matched by id; missing ones are removed, so `[]`
 * un-splits), or, without `input`, keeps them and re-syncs their transfers after the parent's
 * date or account changed. Transfer lines keep a transaction in the other account with the
 * opposite amount and the parent's date, following the 5b rules.
 */
export async function syncLines(
  tx: Db,
  ctx: {
    budgetId: string;
    parentId: string;
    date: string;
    account: AccountRow;
    /** The parent moved to `account` from another one. */
    moved: boolean;
  },
  input?: readonly LineInput[],
) {
  const { budgetId, parentId, date, account, moved } = ctx;
  const existing = await splitLines(tx, parentId);
  const counterparts = await lockCounterparts(
    tx,
    existing.map((l) => l.id),
  );
  const otherOf = new Map(counterparts.map((c) => [c.transferSubTransactionId, c]));
  const byId = new Map(existing.map((l) => [l.id, l]));

  const specs: LineSpec[] = input
    ? input.map((l) => ({
        id: l.id,
        amount: BigInt(l.amount),
        payeeName: l.payeeName,
        transferAccountId: l.transferAccountId ?? null,
        categoryId: l.categoryId,
        explicitCategory: true,
        memo: l.memo,
      }))
    : existing.map((l) => ({
        id: l.id,
        amount: l.amount,
        transferAccountId: otherOf.get(l.id)?.accountId ?? null,
        categoryId: l.categoryId,
        explicitCategory: false,
      }));

  // Lines left out go first, with their transfers.
  const kept = new Set(specs.flatMap((s) => (s.id ? [s.id] : [])));
  for (const line of existing) {
    if (kept.has(line.id)) continue;
    const other = otherOf.get(line.id);
    if (other?.cleared === "reconciled") reconciledOtherSide();
    if (other) await tx.delete(transaction).where(eq(transaction.id, other.id));
    await tx.delete(subTransaction).where(eq(subTransaction.id, line.id));
  }

  for (const [index, spec] of specs.entries()) {
    const old = spec.id ? byId.get(spec.id) : undefined;
    if (spec.id && !old) throw new AppError(400, "BAD_REQUEST", "No such line in this split");
    const other = old ? otherOf.get(old.id) : undefined;

    let transferTo: AccountRow | null = null;
    if (spec.transferAccountId) {
      transferTo = await findAccount(tx, budgetId, spec.transferAccountId);
      assertNotSelf(account, transferTo);
    }
    const retargeted = (transferTo?.id ?? null) !== (other?.accountId ?? null);
    if (transferTo && retargeted) assertOpen(transferTo);
    if (
      other?.cleared === "reconciled" &&
      (retargeted || other.amount !== -spec.amount || other.date !== date)
    ) {
      reconciledOtherSide();
    }

    let categoryId = spec.categoryId;
    if (spec.explicitCategory) {
      categoryId = await resolveCategory(tx, budgetId, account, transferTo, spec.categoryId);
    } else if (moved || retargeted) {
      const keep = usesCategory(account, transferTo) ? spec.categoryId : null;
      categoryId = await resolveCategory(tx, budgetId, account, transferTo, keep);
    }
    const payeeId = transferTo
      ? await transferPayeeId(tx, transferTo)
      : spec.payeeName === undefined
        ? (old?.payeeId ?? null)
        : spec.payeeName
          ? await findOrCreatePayee(tx, budgetId, spec.payeeName)
          : null;

    const values = {
      sortOrder: index,
      amount: spec.amount,
      currency: account.currency,
      payeeId,
      categoryId,
      memo: spec.memo,
    };
    let lineId: string;
    if (old) {
      lineId = old.id;
      await tx.update(subTransaction).set(values).where(eq(subTransaction.id, old.id));
    } else {
      lineId = newId();
      await tx.insert(subTransaction).values({ id: lineId, transactionId: parentId, ...values });
    }

    if (other && !transferTo) {
      await tx.delete(transaction).where(eq(transaction.id, other.id));
    } else if (other && transferTo) {
      const keep = usesCategory(transferTo, account) ? other.categoryId : null;
      await tx
        .update(transaction)
        .set({
          accountId: transferTo.id,
          currency: transferTo.currency,
          date,
          amount: -spec.amount,
          payeeId: moved ? await transferPayeeId(tx, account) : undefined,
          categoryId:
            moved || retargeted
              ? await resolveCategory(tx, budgetId, transferTo, account, keep)
              : undefined,
        })
        .where(eq(transaction.id, other.id));
    } else if (transferTo) {
      await insertTransaction(tx, {
        budgetId,
        accountId: transferTo.id,
        date,
        amount: -spec.amount,
        currency: transferTo.currency,
        payeeId: await transferPayeeId(tx, account),
        categoryId: await resolveCategory(tx, budgetId, transferTo, account, null),
        memo: spec.memo ?? "",
        cleared: "uncleared",
        transferSubTransactionId: lineId,
      });
    }
  }
}

/** Removes a split's transfer lines' other sides before the split itself is deleted. */
export async function deleteLineTransfers(tx: Db, parentId: string) {
  const lines = await splitLines(tx, parentId);
  const counterparts = await lockCounterparts(
    tx,
    lines.map((l) => l.id),
  );
  if (counterparts.some((c) => c.cleared === "reconciled")) reconciledOtherSide();
  if (counterparts.length > 0) {
    await tx.delete(transaction).where(
      inArray(
        transaction.id,
        counterparts.map((c) => c.id),
      ),
    );
  }
}
