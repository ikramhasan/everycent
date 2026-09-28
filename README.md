# everycent

Zero-based budgeting — every cent gets a job. YNAB-style envelope budgeting with first-class
multi-currency support.

## Stack

| Layer | Tech |
| --- | --- |
| Monorepo | pnpm workspaces (catalogs) + Turborepo, Biome |
| API (`apps/api`) | Hono + @hono/zod-openapi on Node, Better Auth, Scalar docs |
| Web (`apps/web`) | Vite + React 19, TanStack Router + Query, Tailwind v4, shadcn/ui |
| DB (`packages/db`) | PostgreSQL 17 + Drizzle ORM |
| Money (`packages/money`) | Exact bigint minor-unit arithmetic, ISO 4217, FX |
| API client (`packages/api-client`) | Generated from OpenAPI (openapi-typescript + openapi-fetch) |
| UI (`packages/ui`) | Shared shadcn/ui components and theme |

## Getting started

Requirements: Node ≥ 24, pnpm (auto-selected via `packageManager` — root `.npmrc` sets
`manage-package-manager-versions=true`), Docker.

    cp .env.example .env            # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
    pnpm install
    pnpm db:up && pnpm db:migrate
    pnpm db:seed                    # optional demo user: demo@everycent.dev / everycent-demo
    pnpm dev

- Web: http://localhost:5173
- API: http://localhost:3000 — docs at http://localhost:3000/docs, spec at `/openapi.json`

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Postgres + API (watch) + web |
| `pnpm check` | lint + typecheck + test + build — run before every commit |
| `pnpm generate` | Re-emit `openapi.json` and regenerate the typed API client |
| `pnpm db:generate` | Create a SQL migration from schema changes |
| `pnpm db:migrate` / `db:studio` / `db:seed` | Apply migrations / browse data / seed demo user |
| `pnpm format` | Biome format + safe fixes |

## Adding an API endpoint

1. Add `apps/api/src/routes/<feature>/{routes,handlers,index}.ts` using `createRouter()`.
2. Mount it in `apps/api/src/app.ts` under `/v1`.
3. `pnpm generate` → commit `openapi.json` and `schema.gen.ts`.
4. Use it in the web app via `$api.useQuery("get", "/v1/...")`.
