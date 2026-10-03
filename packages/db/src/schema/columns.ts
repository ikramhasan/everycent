import { sql } from "drizzle-orm";
import { timestamp } from "drizzle-orm/pg-core";

/**
 * Standard audit columns. Spread into every table. Both come from the database clock (`now()`),
 * on insert and on update, so they can be compared: mixing in the app's clock (`new Date()`) let an
 * update look older than the insert when the two clocks drifted apart.
 */
export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
};
