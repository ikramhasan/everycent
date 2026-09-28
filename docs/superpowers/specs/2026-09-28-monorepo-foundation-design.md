# everycent — Monorepo Foundation Design

- **Date:** 2026-09-28
- **Status:** Approved in conversation, pending written-spec review
- **Scope:** Bootstrap the monorepo that all future everycent work builds on. No budgeting features.

## 1. Context & intent

everycent is a zero-based budgeting app ("every cent needs to be assigned") targeting one-to-one
feature parity with YNAB (assign money to categories, Ready to Assign, targets/goals, scheduled
transactions, reconciliation, age of money, reports), plus extras — first of which is
**multi-currency support**.

This spec covers **only the foundation**: tooling, app skeletons, shared packages, the typed API
contract pipeline, database wiring, and auth. Success = a developer can clone, run one command, sign
up, sign in, see an authenticated app shell whose data comes from a typed, OpenAPI-documented Hono
API — and every quality gate (lint, typecheck, test, build) passes.

### Decisions made (with the user)

| Topic | Decision |
|---|---|
| Runtime / package manager | Node (LTS ≥ 24) + pnpm workspaces + Turborepo |
| Backend | Hono + `@hono/zod-openapi` on `@hono/node-server` |
| Frontend | Vite SPA: React 19 + TanStack Router (file-based) + TanStack Query |
| Styling | Tailwind CSS v4 + shadcn/ui (monorepo mode, shared `packages/ui`) |
| Database | PostgreSQL 17 (docker-compose for dev) + Drizzle ORM + drizzle-kit |
| Auth | Better Auth (email + password, DB sessions, cookies) — in the foundation |
| Lint / format | Biome (single root config) |
| API typing strategy | **OpenAPI-first**: spec generated from zod-openapi routes → `openapi-typescript` types → `openapi-fetch` / `openapi-react-query` client |
| Location | Monorepo root is the current directory (`BudgetApp/`); root package name `everycent` |

### Why OpenAPI-first instead of Hono RPC (`hc`)

The user requires automatic OpenAPI. Making the generated spec the *consumed* contract means it
cannot silently drift (a wrong spec breaks the web build), it serves future non-TS clients (mobile,
CLI, third parties), and it avoids `hc` type-inference slowdowns at YNAB-scale endpoint counts.
Cost: one codegen step, automated by Turbo.

## 2. Repository layout

```
everycent/ (repo root)
├─ apps/
│  ├─ api/          @everycent/api  — Hono HTTP API
│  └─ web/          @everycent/web  — Vite SPA
├─ packages/
│  ├─ db/           @everycent/db          — Drizzle schema, client, migrations, seed
│  ├─ money/        @everycent/money       — pure money/currency domain library
│  ├─ api-client/   @everycent/api-client  — generated OpenAPI types + typed clients
│  ├─ ui/           @everycent/ui          — shadcn/ui components, Tailwind theme, cn()
│  └─ tsconfig/     @everycent/tsconfig    — shared strict TS configs
├─ docs/            specs, plans, ADRs
├─ docker-compose.yml
├─ turbo.json · pnpm-workspace.yaml · biome.json
├─ .env.example · .nvmrc · .gitignore · .editorconfig
└─ package.json     (packageManager pinned, engines.node)
```

### Package conventions

- All `packages/*` are **internal source packages**: `exports` point at `.ts` source; no build step.
  Apps' bundlers/`tsx` compile them. This keeps the dev loop instant.
- Every workspace package has scripts where applicable: `dev`, `build`, `typecheck`, `test`, `lint`.
- Dependencies use `workspace:*` for internal packages. Shared third-party versions are aligned via a
  pnpm **catalog** in `pnpm-workspace.yaml` (single place to bump React, Zod, TS, etc.).
- TS: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` off (friction with libs),
  `verbatimModuleSyntax`, `moduleResolution: "bundler"`, ESM everywhere (`"type": "module"`).

## 3. `packages/money` — money domain rules

Foundational invariant for the whole product: **money is never a float.**

- `Money = { amount: bigint; currency: CurrencyCode }` where `amount` is in the currency's
  **minor units** (cents for USD, 0 decimals for JPY, 3 for KWD).
- ISO-4217 currency table (`code`, `exponent`, `symbol`, `name`).
- Operations: `add`, `subtract`, `negate`, `isZero`, `compare`, `sum` — all throw on currency
  mismatch. `allocate(money, ratios)` splits without losing a cent (largest-remainder).
- `parse(input: string, currency)` / `format(money, locale)` using `Intl.NumberFormat`, with
  bigint-safe string handling (no float round-trips).
- FX: `convert(money, rate, targetCurrency, rounding)` where `rate` is a decimal **string**
  (e.g. `"1.0835"`), computed with scaled-bigint arithmetic, banker's rounding by default.
- Wire format: amounts cross the API as **strings of minor units** (`"12345"`) because JSON numbers
  cannot represent bigint safely. Zod helpers for this live here (`zMinorUnits`, `zCurrencyCode`).
- Pure, dependency-free except Zod; exhaustively unit-tested.

Multi-currency model (for future features, recorded here so the DB foundation is compatible): a
budget has a **base currency**; each account has its own currency; transactions store amount in the
account's currency; budget-level math converts to base currency via stored FX rates.

## 4. `packages/db`

- Drizzle ORM with the `postgres` (postgres.js) driver. Exports `createDb(url)` and the schema.
- Schema in `src/schema/*.ts`. Foundation tables: Better Auth's `user`, `session`, `account`,
  `verification` (generated via Better Auth CLI, then owned by us). No budgeting tables yet.
- Conventions for all future tables: `text` UUIDv7-style ids generated in app code, `created_at` /
  `updated_at` `timestamptz`, money columns `bigint` (mode `bigint`) + adjacent `currency char(3)`.
  snake_case columns via Drizzle `casing: "snake_case"`.
- drizzle-kit: `db:generate` (SQL migrations committed under `packages/db/migrations`),
  `db:migrate`, `db:studio`. `db:seed` creates a demo user.
- `drizzle-zod` available for deriving schemas where useful (API schemas remain explicit).

## 5. `apps/api` — Hono API

### Structure

```
apps/api/src/
├─ app.ts            createApp(deps) → OpenAPIHono  (no port binding; used by tests)
├─ index.ts          serve(createApp(...)) via @hono/node-server + graceful shutdown
├─ env.ts            Zod-validated env; process exits on invalid config
├─ lib/
│  ├─ auth.ts        Better Auth instance (drizzle adapter, email+password)
│  ├─ errors.ts      AppError, error schema, onError / notFound handlers
│  └─ openapi.ts     createRouter() with shared defaultHook, security schemes
├─ middleware/
│  └─ require-auth.ts   sets c.var.user / c.var.session, 401 otherwise
├─ routes/
│  ├─ health/        GET /v1/health  (public; checks DB)
│  └─ me/            GET /v1/me      (authed; returns current user)
└─ scripts/emit-openapi.ts   writes apps/api/openapi.json without listening
```

Each feature module: `routes.ts` (`createRoute` definitions with Zod request/response schemas) +
`handlers.ts` (implementations) + `index.ts` (router wiring) + `*.test.ts`.

### Behavior

- Base path `/v1` for our API; Better Auth at `/api/auth/*` (`auth.handler`).
- `GET /openapi.json` — OpenAPI 3.1 document. `GET /docs` — Scalar API reference.
- The `openapi:emit` script writes `apps/api/openapi.json`; the file is **committed** so API changes
  are visible in review.
- Validation errors (via shared `defaultHook`) and all thrown errors produce:
  `{ "error": { "code": string, "message": string, "details"?: unknown } }` with the correct status.
  Unknown errors → 500 with generic message; details logged, never leaked.
- Middleware: request id, logger, secure headers, CORS (credentials, origin = `WEB_ORIGIN`).
- `requireAuth` is registered as a `cookieAuth` security scheme so authed routes are marked in docs.
- Env: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`, `PORT` (default 3000).

## 6. `packages/api-client`

- `generate` script: `openapi-typescript ../../apps/api/openapi.json -o src/schema.gen.ts`
  (generated file committed).
- Exports `createApiClient(baseUrl)` (openapi-fetch, `credentials: "include"`) and
  `createQueryApi(client)` (openapi-react-query), plus the `paths`/`components` types.

## 7. `apps/web` — SPA

- Vite + `@vitejs/plugin-react` + `@tanstack/router-plugin` (file-based routes, auto code-split) +
  `@tailwindcss/vite`.
- Dev server proxies `/v1` and `/api` to the API → same-origin, cookies work with no CORS in dev.
- Router context: `{ queryClient, auth }`. `routes/_authed.tsx` `beforeLoad` checks session
  (Better Auth `getSession`) and redirects to `/sign-in?redirect=…`.
- Routes: `/sign-in`, `/sign-up`, `/_authed/` (app shell: sidebar + header, placeholder "Budget"
  page that calls `GET /v1/me` via the typed query client), 404 route.
- Auth UI uses `better-auth/react` `createAuthClient`.
- Theme: light/dark via `class` on `<html>`, persisted in localStorage, system default.

## 8. `packages/ui` — shadcn/ui

- shadcn monorepo setup: `packages/ui/components.json` + `apps/web/components.json` with aliases
  pointing to `@everycent/ui/components`, `@everycent/ui/lib/utils`, `@everycent/ui/hooks`.
- Tailwind v4 theme (CSS variables, light + dark) in `packages/ui/src/styles/globals.css`,
  imported by web; `@source` covers both `packages/ui` and `apps/web`.
- Initial components: button, input, label, card, sonner, dropdown-menu, separator, sidebar,
  skeleton, tooltip, avatar, sheet (whatever `sidebar` requires). Added via the `shadcn` CLI.

## 9. Dev workflow

| Command | Does |
|---|---|
| `pnpm install` | install all workspaces |
| `pnpm db:up` / `db:down` | start/stop Postgres via docker compose |
| `pnpm dev` | `db:up`, then Turbo runs api (`tsx watch`) + web (vite) in parallel |
| `pnpm db:generate` / `db:migrate` / `db:studio` / `db:seed` | Drizzle tasks |
| `pnpm generate` | `openapi:emit` → `api-client:generate` |
| `pnpm lint` / `format` | Biome check / write |
| `pnpm typecheck` · `test` · `build` | via Turbo across all packages |
| `pnpm check` | lint + typecheck + test + build (the full gate) |

Turbo dependencies: `api-client#generate` depends on `api#openapi:emit`; `web#typecheck`/`build`
depend on `api-client#generate`. Caching enabled for pure tasks.

Postgres: `docker-compose.yml` runs `postgres:17` with a named volume and creates both
`everycent` and `everycent_test` databases (init script).

## 10. Testing strategy

- Vitest in `money`, `api`, `web` (web: jsdom + Testing Library, one smoke test for now).
- API tests use `createApp()` + `app.request()` against the real `everycent_test` Postgres database
  (migrations applied in global setup; no DB mocking). Cover: health, 401 on `/v1/me` without
  session, sign-up → `/v1/me` returns user, validation error shape, 404 shape.
- Test that the committed `openapi.json` matches a fresh emit (drift guard).
- `money` gets exhaustive unit tests (arithmetic, allocation, parse/format, FX rounding, currency
  mismatch errors, zero-decimal and 3-decimal currencies).

## 11. Out of scope (explicitly)

Budgeting tables and features, CI configuration, git hooks, deployment config, Better Auth social
providers / email verification / password reset emails, i18n beyond `Intl` formatting, mobile.

## 12. Risks & notes

- **TypeScript 7 (native) is current.** Some tools (e.g. `openapi-typescript`, drizzle-kit) may rely
  on the TS JS API. If incompatible, pin TypeScript 5.9.x across the catalog and record why.
- Latest majors at bootstrap time (verify at install): hono 4.x, @hono/zod-openapi 1.x, zod 4.x,
  better-auth 1.x, drizzle-orm 0.45, TanStack Router 1.x, Query 5.x, Vite 8, Tailwind 4, Vitest 5,
  Biome 2, Turbo 2. Versions are pinned via the pnpm catalog.
- pnpm installed locally is 9.9; `packageManager` will pin a current pnpm (via corepack) that
  supports catalogs.
