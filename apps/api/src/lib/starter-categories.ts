import { type Database, newId } from "@everycent/db";
import { category, categoryGroup } from "@everycent/db/schema";

/**
 * Categories a new budget starts with, in YNAB's default groups. The setup flow lets people
 * untick the ones they don't need.
 */
export const STARTER_CATEGORIES: ReadonlyArray<{ group: string; categories: readonly string[] }> = [
  {
    group: "Bills",
    categories: ["🏡 Rent/Mortgage", "🔌 Electric", "💧 Water", "🌐 Internet", "📱 Phone"],
  },
  { group: "Frequent", categories: ["🛒 Groceries", "🍽️ Eating Out", "🚌 Transportation"] },
  { group: "Non-Monthly", categories: ["🔧 Home Maintenance", "🚗 Auto Maintenance", "🎁 Gifts"] },
  { group: "Goals", categories: ["🏖️ Vacation", "🎓 Education", "🔨 Home Improvement"] },
  {
    group: "Quality of Life Goals",
    categories: ["🎨 Hobbies", "💪 Health & Wellness", "🎬 Entertainment"],
  },
];

/** Every budget's internal group with Inflow: Ready to Assign and Uncategorized. */
export async function seedInternalCategories(db: Database, budgetId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const internalGroupId = newId();
    await tx.insert(categoryGroup).values({
      id: internalGroupId,
      budgetId,
      name: "Internal",
      sortOrder: 0,
      internal: true,
    });
    await tx.insert(category).values([
      {
        id: newId(),
        budgetId,
        groupId: internalGroupId,
        name: "Inflow: Ready to Assign",
        sortOrder: 0,
        internalKind: "ready_to_assign",
      },
      {
        id: newId(),
        budgetId,
        groupId: internalGroupId,
        name: "Uncategorized",
        sortOrder: 1,
        internalKind: "uncategorized",
      },
    ]);
  });
}

/** The starter template, for budgets created from scratch (a fresh start copies instead). */
export async function seedStarterCategories(db: Database, budgetId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const groups = STARTER_CATEGORIES.map((g, i) => ({ ...g, id: newId(), sortOrder: i }));
    await tx
      .insert(categoryGroup)
      .values(groups.map(({ id, group, sortOrder }) => ({ id, budgetId, name: group, sortOrder })));
    await tx.insert(category).values(
      groups.flatMap(({ id: groupId, categories }) =>
        categories.map((name, sortOrder) => ({
          id: newId(),
          budgetId,
          groupId,
          name,
          sortOrder,
        })),
      ),
    );
  });
}
