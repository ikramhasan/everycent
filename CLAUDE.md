# everycent — agent guide

Read `README.md` first.

## Invariants (never break)

- **Money is never a float.** Use `@everycent/engine`: `bigint` minor units + `CurrencyCode`.
  DB: `bigint` column (mode "bigint") + adjacent `currency char(3)`. JSON: integer string
  (`zMoney`/`zMinorUnits`). Never `Number(amount)`, never `parseFloat`.
- Currency exponents in `packages/engine/src/currency.ts` must never change for an existing code.
- Every API router comes from `createRouter()` (shared validation error shape). Errors are thrown
  as `AppError(status, CODE, message)` and rendered as `{ error: { code, message, details? } }`.
- Every route has an `operationId`, a response schema and documented error responses (`jsonError`).
- Authed routes use `middleware: [requireAuth] as const` and `security: [{ cookieAuth: [] }]`.
- Handlers read dependencies from `c.var.deps` — never import a global db/auth.
- After changing API routes: `pnpm generate` and commit `apps/api/openapi.json` +
  `packages/api-client/src/schema.gen.ts` (a test fails if they drift).
- Schema changes: edit `packages/db/src/schema/*`, then `pnpm db:generate`; commit migrations.
  Never edit an applied migration. Primary keys are `newId()` (UUIDv7) text ids.
- New third-party deps go through the `catalog:` in `pnpm-workspace.yaml`.
- API tests use `createTestApp()` + `resetDatabase()` against the real test DB. No DB mocks.
- shadcn components: `pnpm dlx shadcn@latest add <name> -c apps/web` (lands in `packages/ui`).
- Web imports: app code via `@/…`, shared UI via `@everycent/ui/components/<name>`.

## Gotchas / conventions

- **pnpm & supply-chain policy.** pnpm 12.6.0 is pinned via `packageManager`; root `.npmrc` sets
  `manage-package-manager-versions=true` so any pnpm ≥ 9.7 auto-switches to it. pnpm 12 enforces a
  24h `minimumReleaseAge` policy — a brand-new release can't be installed until it's a day old. If
  a catalog bump fails because of this, lower the pinned version rather than adding a
  `minimumReleaseAgeExclude` entry. `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml`
  approves esbuild's postinstall; some `@tanstack/react-router*` packages are exact-pinned (no
  `^`) in the catalog for the same freshness reason — see the comment above the catalog block.
- **TypeScript is pinned `~5.9.3`** because `openapi-typescript` requires TS 5.
- **Theme.** There is no `next-themes`. The provider is `ThemeProvider`/`useTheme` from
  `@everycent/ui/lib/theme`, plus a static pre-paint script in `apps/web/index.html` (kept in
  sync with `theme.tsx` by hand) that avoids a flash of the wrong theme. Persisted under the
  `localStorage` key `"theme"`.
- **Auth session (web).** After any auth transition (sign-in/up/out), call
  `refreshSession(queryClient)` from `apps/web/src/lib/session.ts` — not `invalidateQueries`,
  because `ensureQueryData` (used by route `beforeLoad`s) returns stale-but-cached data, so a
  signed-out `null` could still win a race right after sign-in. Sign-out also calls
  `queryClient.clear()`.
- **shadcn CLI quirks.** `pnpm dlx shadcn@latest add <name> -c apps/web` (currently 4.21) may
  write hooks into `apps/web/src/hooks` — move them to `packages/ui/src/hooks`. It may also
  import `cn` from an npm package literally named `cn` — rewrite that import to
  `@everycent/ui/lib/utils` and do not add a `cn` dependency. Components under `packages/ui` are
  owned/vendored code and are lint-exempt (Biome still formats them).
- **Test typing.** `res.json()` from the Hono test client / `fetch` is typed `Promise<unknown>`;
  narrow with an explicit `as { ... }` cast at the call site rather than loosening the type.
- **Bundling workspace packages.** `apps/api`'s `tsdown.config.ts` uses `deps.alwaysBundle:
  [/^@everycent\//]` (tsdown 0.23 renamed `noExternal` to `deps.alwaysBundle`) since workspace
  packages ship TS source and must be bundled into the built server.
- **Demo seed user.** `pnpm db:seed` creates `demo@everycent.dev` / `everycent-demo` (see
  `apps/api/src/scripts/seed.ts`) — a public dev-only constant, safe to show in docs.

## Before claiming done

`pnpm check` must pass.
