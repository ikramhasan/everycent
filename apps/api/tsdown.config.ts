import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    worker: "src/worker.ts",
    migrate: "src/scripts/migrate.ts",
    "reset-password": "src/scripts/reset-password.ts",
  },
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  clean: true,
  // Workspace packages ship TypeScript source, so they must be bundled into the server.
  // tsdown 0.23 renamed the top-level `noExternal` option to `deps.alwaysBundle`.
  deps: { alwaysBundle: [/^@everycent\//] },
});
