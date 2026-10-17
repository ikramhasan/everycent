import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      // Under a full parallel run (pnpm check) a test that renders a long list (the currency
      // picker's ~160 options) and types into it can pass 5 s; one that times out keeps typing
      // into the next test's form. Same allowance as the API tests (EVERYCENT-116, EVERYCENT-223).
      testTimeout: 15_000,
    },
  }),
);
