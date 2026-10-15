import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    // All API test files share one Postgres database.
    fileParallelism: false,
    // Most tests sign up through Better Auth (scrypt-hashing the password at sign-up and again at
    // sign-in), so a test that takes ~1 s alone can pass 5 s when the machine is busy (dev
    // servers, a browser, other checkouts' test runs). Keep tests short; this only stops load
    // from failing them (EVERYCENT-116).
    testTimeout: 15_000,
  },
});
