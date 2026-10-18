import { createDb } from "@everycent/db";
import { user } from "@everycent/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, testEnv } from "../../test/helpers";
import { DEMO_USER, seedDemoUser } from "./demo-user";

const env = testEnv();
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
afterAll(close);
beforeEach(() => resetDatabase(db));

describe("seedDemoUser", () => {
  it("creates the demo user confirmed, once", async () => {
    // The sign-up's confirmation email goes to the console.
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await seedDemoUser(env)).toBe("created");
    expect(await seedDemoUser(env)).toBe("exists");

    const rows = await db.select().from(user).where(eq(user.email, DEMO_USER.email));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.emailVerified).toBe(true);
  });
});
