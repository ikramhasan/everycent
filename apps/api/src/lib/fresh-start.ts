import { newId } from "@everycent/db";
import {
  budget,
  budgetAccount,
  budgetMember,
  category,
  categoryGroup,
  categoryTarget,
  flagName,
  payee,
} from "@everycent/db/schema";
import { formatDate, monthOf } from "@everycent/engine";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { accountBalances, insertStartingBalance, type Tx, transferPayeeId } from "./ledger";

type BudgetRow = typeof budget.$inferSelect;

/**
 * Copies the old budget's setup into the freshly created `newBudgetId`, YNAB-style: partners,
 * category groups and categories (order, hidden flags, notes, targets), payees, flag names, and
 * accounts (with their transfer payees), each starting from its working balance on `date`. No
 * transactions come along. Then archives the old budget.
 *
 * Scheduled transactions will have to be copied too once they exist (docs/deferred.md).
 */
export async function copyIntoFreshStart(
  tx: Tx,
  input: { old: BudgetRow; newBudgetId: string; ownerId: string; date: string },
) {
  const { old, newBudgetId, ownerId, date } = input;

  // Partners keep their access and role; the owner was added when the budget was created.
  const members = await tx
    .select()
    .from(budgetMember)
    .where(and(eq(budgetMember.budgetId, old.id), ne(budgetMember.userId, ownerId)));
  if (members.length > 0) {
    await tx.insert(budgetMember).values(
      members.map((m) => ({
        id: newId(),
        budgetId: newBudgetId,
        userId: m.userId,
        role: m.role,
      })),
    );
  }

  // Accounts first, so payment categories can point at the new ones.
  const accounts = await tx
    .select()
    .from(budgetAccount)
    .where(eq(budgetAccount.budgetId, old.id))
    .orderBy(asc(budgetAccount.sortOrder), asc(budgetAccount.id));
  const balances = await accountBalances(tx, old.id, date);
  const accountIds = new Map<string, string>();
  for (const a of accounts) {
    const id = newId();
    accountIds.set(a.id, id);
    await tx.insert(budgetAccount).values({
      id,
      budgetId: newBudgetId,
      name: a.name,
      type: a.type,
      note: a.note,
      sortOrder: a.sortOrder,
      closed: a.closed,
      currency: a.currency,
      interestRate: a.interestRate,
      minimumPayment: a.minimumPayment,
      escrowAmount: a.escrowAmount,
    });
    await transferPayeeId(tx, { id, budgetId: newBudgetId, name: a.name });
    await insertStartingBalance(tx, {
      budgetId: newBudgetId,
      accountId: id,
      type: a.type,
      amount: balances.get(a.id)?.working ?? 0n,
      currency: a.currency,
      date,
    });
  }

  // People's payees; the internal ones are recreated on first use, transfer ones came with the
  // accounts.
  const payees = await tx
    .select({ name: payee.name })
    .from(payee)
    .where(
      and(eq(payee.budgetId, old.id), isNull(payee.internalKind), isNull(payee.transferAccountId)),
    );
  if (payees.length > 0) {
    await tx
      .insert(payee)
      .values(payees.map((p) => ({ id: newId(), budgetId: newBudgetId, name: p.name })));
  }

  const flags = await tx.select().from(flagName).where(eq(flagName.budgetId, old.id));
  if (flags.length > 0) {
    await tx
      .insert(flagName)
      .values(
        flags.map((f) => ({ id: newId(), budgetId: newBudgetId, color: f.color, name: f.name })),
      );
  }

  const groups = await tx
    .select()
    .from(categoryGroup)
    .where(and(eq(categoryGroup.budgetId, old.id), eq(categoryGroup.internal, false)));
  const groupIds = new Map<string, string>();
  for (const g of groups) {
    const id = newId();
    groupIds.set(g.id, id);
    await tx.insert(categoryGroup).values({
      id,
      budgetId: newBudgetId,
      name: g.name,
      sortOrder: g.sortOrder,
      hidden: g.hidden,
      kind: g.kind,
    });
  }

  const categories = await tx
    .select()
    .from(category)
    .where(and(eq(category.budgetId, old.id), isNull(category.internalKind)));
  const targets = new Map(
    (await tx.select().from(categoryTarget).where(eq(categoryTarget.budgetId, old.id))).map((t) => [
      t.categoryId,
      t,
    ]),
  );
  for (const c of categories) {
    const groupId = groupIds.get(c.groupId);
    if (!groupId) continue;
    const id = newId();
    await tx.insert(category).values({
      id,
      budgetId: newBudgetId,
      groupId,
      name: c.name,
      note: c.note,
      sortOrder: c.sortOrder,
      hidden: c.hidden,
      linkedAccountId: c.linkedAccountId ? (accountIds.get(c.linkedAccountId) ?? null) : null,
    });
    const target = targets.get(c.id);
    if (target) {
      // The new budget starts on `date`, so its targets start in that month.
      await tx.insert(categoryTarget).values({
        id: newId(),
        budgetId: newBudgetId,
        categoryId: id,
        cadence: target.cadence,
        behavior: target.behavior,
        amount: target.amount,
        currency: target.currency,
        dueDay: target.dueDay,
        dueDate: target.dueDate,
        repeatEvery: target.repeatEvery,
        repeatUnit: target.repeatUnit,
        startMonth: `${monthOf(date)}-01`,
      });
    }
  }

  await tx
    .update(budget)
    .set({
      name: `${old.name} (Archived ${formatDate(date, old.dateFormat)})`,
      archivedAt: new Date(),
    })
    .where(eq(budget.id, old.id));
}
