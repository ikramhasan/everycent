import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    // All API test files share one Postgres database.
    fileParallelism: false,
  },
});
