# everycent Monorepo Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the `everycent` pnpm/Turborepo monorepo: Hono API with auto-generated OpenAPI, Better Auth, Drizzle/Postgres, a pure money library, a generated typed API client, shared shadcn/ui, and a TanStack Router SPA that signs in and renders an authenticated shell.

**Architecture:** OpenAPI-first. API routes are declared with `@hono/zod-openapi`; a script emits `apps/api/openapi.json`; `openapi-typescript` turns it into types in `packages/api-client`, consumed by the web app via `openapi-fetch`/`openapi-react-query`. Internal packages are TS source packages (no build step). Money is always integer minor units (`bigint`) + ISO-4217 code.

**Tech Stack:** Node ≥24, pnpm (catalogs), Turborepo 2, TypeScript 5.9, Biome 2, Hono 4, @hono/zod-openapi 1, Zod 4, Better Auth 1.7, Drizzle ORM 0.45 + drizzle-kit, Postgres 17 (docker), Vite 8, React 19, TanStack Router/Query, Tailwind 4, shadcn/ui, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-28-monorepo-foundation-design.md`

## Global Constraints

- Monorepo root = repo root (`BudgetApp/`), root package name `everycent`; workspace packages are `@everycent/<name>`.
- Node `>=24` (`.nvmrc` = `24`); ESM everywhere (`"type": "module"`).
- All third-party versions come from the pnpm `catalog:` in `pnpm-workspace.yaml` (exception: deps the shadcn CLI adds to `packages/ui`).
- TypeScript is pinned `~5.9.3` (openapi-typescript peer requires `^5.x`; TS 7 is NOT used).
- TS: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `moduleResolution: "Bundler"`. No `any` without a Biome-ignore comment explaining why.
- Money is never a float: `bigint` minor units + `CurrencyCode`. Over JSON, amounts are strings of minor units.
- Error response shape everywhere: `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
- Our API lives under `/v1`; Better Auth under `/api/auth/*`; spec at `/openapi.json`; docs at `/docs`.
- Generated files are committed and excluded from Biome: `apps/api/openapi.json`, `packages/api-client/src/schema.gen.ts`, `apps/web/src/routeTree.gen.ts`, `packages/db/migrations/**`.
- Tests hit a real Postgres (`everycent_test`); never mock the DB.
- Every commit message ends with `Co-Authored-By: Claude <noreply@anthropic.com>`.
- If a library API in this plan doesn't match the installed version, follow the installed version's types/docs (use context7), keep the behavior identical, and note the deviation in the commit message.

## Review Focus

1. **Open redirect on `/sign-in?redirect=`** — a crafted `redirect=//evil.com` or `https://evil.com` must land on `/`, never off-site. Pinned in Task 8 (`safe-redirect.test.ts`).
2. **Amounts beyond 2^53** — parsing and formatting a 20+ digit amount must be exact (no float round-trip). Pinned in Task 2 (`parse-format.test.ts`).
3. **Sloppy user-typed amounts** (`"1.234"` for USD, `"abc"`, `""`, `"-"`, `"1.5"` for JPY) — must throw `MoneyParseError`, never silently round. Pinned in Task 2.
4. **Duplicate sign-up with an existing email** — must return a 4xx, not a 500. Pinned in Task 5 (`me.test.ts`).
5. **Garbage/expired session cookie** on an authed route — must return our 401 JSON shape, not a 500. Pinned in Task 5.

---

## File Structure

```
.
├─ package.json · pnpm-workspace.yaml · turbo.json · biome.json
├─ .gitignore · .editorconfig · .nvmrc · .env.example
├─ docker-compose.yml · docker/postgres/init/01-create-test-db.sql
├─ README.md · CLAUDE.md
├─ packages/tsconfig/{package.json, base.json, node.json, react.json}
├─ packages/money/src/
│  ├─ errors.ts        MoneyError hierarchy
│  ├─ currency.ts      ISO-4217 exponent table, CurrencyCode, guards
│  ├─ money.ts         Money type + arithmetic/comparison
│  ├─ rounding.ts      divideRounded(num, den, mode)
│  ├─ parse-format.ts  parseMoney, toDecimalString, formatMoney
│  ├─ fx.ts            convert(money, rate, target, mode)
│  ├─ allocate.ts      allocate(money, ratios)
│  ├─ wire.ts          Zod schemas + toWire/fromWire
│  └─ index.ts         public exports
├─ packages/db/
│  ├─ drizzle.config.ts · migrations/ (generated)
│  └─ src/{index.ts, client.ts, id.ts, migrate.ts, migrate-cli.ts, schema/{index.ts, columns.ts, auth.ts}}
├─ apps/api/
│  ├─ openapi.json (generated) · tsdown.config.ts · vitest.config.ts
│  ├─ test/{global-setup.ts, helpers.ts}
│  └─ src/
│     ├─ index.ts        server bootstrap
│     ├─ app.ts          createApp(deps)
│     ├─ types.ts        AppDeps, AppEnv
│     ├─ env.ts          parseEnv
│     ├─ load-env.ts     loadRootEnv
│     ├─ openapi-spec.ts generateOpenApiDocument, OPENAPI_FILE
│     ├─ lib/{errors.ts, router.ts, docs.ts, auth.ts}
│     ├─ middleware/require-auth.ts
│     ├─ routes/health/{routes.ts, handlers.ts, index.ts, health.test.ts}
│     ├─ routes/me/{routes.ts, handlers.ts, index.ts, me.test.ts}
│     └─ scripts/{emit-openapi.ts, seed.ts}
├─ packages/api-client/src/{index.ts, schema.gen.ts, index.test.ts}
├─ packages/ui/  components.json · src/{styles/globals.css, lib/utils.ts, components/*, hooks/*}
└─ apps/web/
   ├─ index.html · vite.config.ts · vitest.config.ts · tsr.config.json · components.json
   └─ src/
      ├─ main.tsx · router.tsx · styles.css · vite-env.d.ts · routeTree.gen.ts
      ├─ lib/{api.ts, auth-client.ts, session.ts, safe-redirect.ts}
      ├─ components/{app-shell.tsx, mode-toggle.tsx, auth-card.tsx, sign-in-form.tsx, sign-up-form.tsx, not-found.tsx}
      ├─ routes/{__root.tsx, sign-in.tsx, sign-up.tsx, _authed.tsx, _authed/index.tsx}
      └─ test/setup.ts
```

---

### Task 1: Root tooling, shared tsconfig, Postgres

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `biome.json`, `.gitignore`, `.editorconfig`, `.nvmrc`, `.env.example`, `docker-compose.yml`, `docker/postgres/init/01-create-test-db.sql`
- Create: `packages/tsconfig/package.json`, `packages/tsconfig/base.json`, `packages/tsconfig/node.json`, `packages/tsconfig/react.json`

**Interfaces:**
- Produces: root scripts (`dev`, `build`, `typecheck`, `test`, `lint`, `format`, `generate`, `check`, `db:*`); tsconfig presets `@everycent/tsconfig/{base,node,react}.json`; Postgres at `localhost:5432` with DBs `everycent` and `everycent_test` (user/pass `everycent`).

- [ ] **Step 1: Write root `package.json`**

```json
{
  "name": "everycent",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "dev": "pnpm db:up && turbo run dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "lint": "biome check .",
    "format": "biome check --write .",
    "generate": "turbo run generate",
    "check": "biome check . && turbo run typecheck test build",
    "db:up": "docker compose up -d --wait",
    "db:down": "docker compose down",
    "db:generate": "pnpm --filter @everycent/db db:generate",
    "db:migrate": "pnpm --filter @everycent/db db:migrate",
    "db:studio": "pnpm --filter @everycent/db db:studio",
    "db:seed": "pnpm --filter @everycent/api db:seed"
  },
  "devDependencies": {
    "@biomejs/biome": "catalog:",
    "turbo": "catalog:",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - apps/*
  - packages/*

catalog:
  "@biomejs/biome": ^2.5.14
  "@hono/node-server": ^2.1.1
  "@hono/zod-openapi": ^1.6.3
  "@scalar/hono-api-reference": ^0.12.6
  "@tailwindcss/vite": ^4.3.3
  "@tanstack/react-query": ^5.104.0
  "@tanstack/react-query-devtools": ^5.104.0
  "@tanstack/react-router": ^1.170.40
  "@tanstack/react-router-devtools": ^1.167.2
  "@tanstack/router-cli": ^1.167.39
  "@tanstack/router-plugin": ^1.168.41
  "@testing-library/jest-dom": ^7.0.1
  "@testing-library/react": ^16.3.3
  "@testing-library/user-event": ^14.6.7
  "@types/node": ^24.0.0
  "@types/react": ^19.3.0
  "@types/react-dom": ^19.3.0
  "@vitejs/plugin-react": ^6.1.1
  better-auth: ^1.7.6
  drizzle-kit: ^0.31.11
  drizzle-orm: ^0.45.3
  hono: ^4.13.9
  jsdom: ^30.1.1
  lucide-react: ^1.48.0
  next-themes: ^0.4.6
  openapi-fetch: ^0.17.0
  openapi-react-query: ^0.5.4
  openapi-typescript: ^7.13.0
  postgres: ^3.4.9
  react: ^19.3.0
  react-dom: ^19.3.0
  sonner: ^2.0.8
  tailwindcss: ^4.3.3
  tsdown: ^0.23.0
  tsx: ^4.23.15
  turbo: ^2.11.5
  typescript: ~5.9.3
  uuid: ^14.0.2
  vite: ^8.3.1
  vitest: ^5.0.2
  zod: ^4.6.5
```

- [ ] **Step 3: Write `turbo.json`**

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "tui",
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "openapi:emit": {
      "inputs": ["src/**", "package.json"],
      "outputs": ["openapi.json"]
    },
    "generate": {
      "dependsOn": ["^generate"],
      "outputs": ["src/*.gen.ts"]
    },
    "@everycent/api-client#generate": {
      "dependsOn": ["@everycent/api#openapi:emit"],
      "inputs": ["../../apps/api/openapi.json", "package.json"],
      "outputs": ["src/schema.gen.ts"]
    },
    "typecheck": {
      "dependsOn": ["^generate", "generate"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^generate", "generate"],
      "cache": false
    },
    "build": {
      "dependsOn": ["^generate", "generate"],
      "outputs": ["dist/**"]
    }
  }
}
```

- [ ] **Step 4: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.14/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": [
      "**",
      "!**/*.gen.ts",
      "!apps/api/openapi.json",
      "!packages/db/migrations"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": { "quoteStyle": "double", "semicolons": "always", "trailingCommas": "all" }
  },
  "css": {
    "parser": { "tailwindDirectives": true }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      },
      "style": {
        "noNonNullAssertion": "error",
        "useImportType": "error"
      }
    }
  },
  "overrides": [
    {
      "includes": ["packages/ui/src/components/**", "packages/ui/src/hooks/**"],
      "linter": { "enabled": false }
    }
  ],
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

(shadcn components are vendored code regenerated by the CLI; we format them but don't lint them.)

- [ ] **Step 5: Write dotfiles**

`.gitignore`:
```gitignore
node_modules
dist
.turbo
coverage
*.log
.DS_Store
.env
.env.*
!.env.example
.vite
*.tsbuildinfo
```

`.editorconfig`:
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

`.nvmrc`:
```
24
```

`.env.example`:
```bash
# Postgres (docker compose)
DATABASE_URL=postgres://everycent:everycent@localhost:5432/everycent
TEST_DATABASE_URL=postgres://everycent:everycent@localhost:5432/everycent_test

# Better Auth — generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
# Public URL the browser uses to reach /api/auth (the Vite dev server proxies it)
BETTER_AUTH_URL=http://localhost:5173
# Origin of the web app (CORS + Better Auth trusted origin)
WEB_ORIGIN=http://localhost:5173

PORT=3000
```

- [ ] **Step 6: Write Docker files**

`docker-compose.yml`:
```yaml
name: everycent

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: everycent
      POSTGRES_PASSWORD: everycent
      POSTGRES_DB: everycent
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U everycent -d everycent"]
      interval: 2s
      timeout: 3s
      retries: 20

volumes:
  pgdata:
```

`docker/postgres/init/01-create-test-db.sql`:
```sql
CREATE DATABASE everycent_test OWNER everycent;
```

- [ ] **Step 7: Write `packages/tsconfig`**

`packages/tsconfig/package.json`:
```json
{
  "name": "@everycent/tsconfig",
  "private": true,
  "files": ["*.json"]
}
```

`packages/tsconfig/base.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": []
  }
}
```

`packages/tsconfig/node.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "types": ["node"]
  }
}
```

`packages/tsconfig/react.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  }
}
```

- [ ] **Step 8: Install and verify tooling**

Run:
```bash
cp .env.example .env
sed -i '' "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" .env
pnpm install
pnpm exec biome --version
pnpm exec turbo --version
pnpm lint
```
Expected: pnpm self-switches to the `packageManager` version (pnpm ≥9.7 does this automatically); install succeeds; Biome 2.5.x and Turbo 2.11.x print; `pnpm lint` reports no errors. If pnpm reports ignored build scripts (e.g. `esbuild`), run `pnpm approve-builds` and approve `esbuild` only, then commit the resulting `pnpm-workspace.yaml` change.

- [ ] **Step 9: Start Postgres and verify both databases exist**

Run:
```bash
pnpm db:up
docker compose exec postgres psql -U everycent -d everycent -Atc "select datname from pg_database where datname like 'everycent%' order by 1"
```
Expected output:
```
everycent
everycent_test
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: bootstrap pnpm/turbo monorepo with biome, shared tsconfig and postgres

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: `@everycent/money` — money domain library (TDD)

**Files:**
- Create: `packages/money/package.json`, `packages/money/tsconfig.json`
- Create: `packages/money/src/{errors,currency,money,rounding,parse-format,fx,allocate,wire,index}.ts`
- Test: `packages/money/src/{currency,money,rounding,parse-format,fx,allocate,wire}.test.ts`

**Interfaces:**
- Produces (all exported from `@everycent/money`):
  - `type CurrencyCode` (union of ISO codes), `CURRENCY_CODES: readonly [CurrencyCode, ...CurrencyCode[]]`, `isCurrencyCode(v: unknown): v is CurrencyCode`, `assertCurrencyCode(v: string): CurrencyCode`, `currencyExponent(c: CurrencyCode): number`
  - `interface Money { readonly amount: bigint; readonly currency: CurrencyCode }`, `money(amount: bigint, currency): Money`, `zero(currency): Money`, `add`, `subtract`, `negate`, `isZero`, `isNegative`, `isPositive`, `compare(a, b): -1 | 0 | 1`, `equals(a, b): boolean`, `sum(items: readonly Money[], currency): Money`
  - `type RoundingMode = "half-even" | "half-up" | "floor" | "ceil" | "trunc"`, `divideRounded(num: bigint, den: bigint, mode?: RoundingMode): bigint`
  - `parseMoney(input: string, currency): Money`, `toDecimalString(m: Money): string`, `formatMoney(m: Money, options?: { locale?: string; currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name" }): string`
  - `convert(m: Money, rate: string, target: CurrencyCode, mode?: RoundingMode): Money`
  - `allocate(m: Money, ratios: readonly (number | bigint)[]): Money[]`
  - `zCurrencyCode`, `zMinorUnits`, `zMoney` (Zod schemas), `type MoneyWire = { amount: string; currency: CurrencyCode }`, `toWire(m): MoneyWire`, `fromWire(w: MoneyWire): Money`
  - Errors: `MoneyError`, `CurrencyMismatchError`, `UnknownCurrencyError`, `MoneyParseError`

- [ ] **Step 1: Package scaffolding**

`packages/money/package.json`:
```json
{
  "name": "@everycent/money",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "catalog:"
  },
  "devDependencies": {
    "@everycent/tsconfig": "workspace:*",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/money/tsconfig.json`:
```json
{
  "extends": "@everycent/tsconfig/base.json",
  "include": ["src"]
}
```

Run: `pnpm install`

- [ ] **Step 2: Write failing tests for currency + errors**

`packages/money/src/currency.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  assertCurrencyCode,
  CURRENCY_CODES,
  currencyExponent,
  isCurrencyCode,
} from "./currency";
import { UnknownCurrencyError } from "./errors";

describe("currency", () => {
  it("knows ISO-4217 exponents including zero- and three-decimal currencies", () => {
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("EUR")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KRW")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
    expect(currencyExponent("BHD")).toBe(3);
  });

  it("guards currency codes", () => {
    expect(isCurrencyCode("USD")).toBe(true);
    expect(isCurrencyCode("usd")).toBe(false);
    expect(isCurrencyCode("XXX")).toBe(false);
    expect(isCurrencyCode("toString")).toBe(false);
    expect(isCurrencyCode(42)).toBe(false);
  });

  it("asserts currency codes", () => {
    expect(assertCurrencyCode("GBP")).toBe("GBP");
    expect(() => assertCurrencyCode("ABC")).toThrow(UnknownCurrencyError);
  });

  it("exposes a sorted, duplicate-free code list", () => {
    expect(CURRENCY_CODES.length).toBeGreaterThan(150);
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
    expect([...CURRENCY_CODES].sort()).toEqual([...CURRENCY_CODES]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @everycent/money test`
Expected: FAIL — cannot resolve `./currency` / `./errors`.

- [ ] **Step 4: Implement errors + currency**

`packages/money/src/errors.ts`:
```ts
export class MoneyError extends Error {
  override name = "MoneyError";
}

export class CurrencyMismatchError extends MoneyError {
  override name = "CurrencyMismatchError";
  constructor(
    readonly left: string,
    readonly right: string,
  ) {
    super(`Currency mismatch: ${left} vs ${right}`);
  }
}

export class UnknownCurrencyError extends MoneyError {
  override name = "UnknownCurrencyError";
  constructor(readonly code: string) {
    super(`Unknown ISO 4217 currency code "${code}"`);
  }
}

export class MoneyParseError extends MoneyError {
  override name = "MoneyParseError";
  constructor(
    readonly input: string,
    reason: string,
  ) {
    super(`Cannot parse "${input}" as money: ${reason}`);
  }
}
```

`packages/money/src/currency.ts`:
```ts
import { UnknownCurrencyError } from "./errors";

/**
 * ISO 4217 minor-unit exponents (circulating currencies, no funds/metals).
 *
 * Stored amounts are integers in these units, so an exponent must NEVER change once a currency
 * is in use. This table is deliberately hardcoded instead of derived from Intl: ICU/CLDR data
 * can differ from ISO and can change between runtime versions.
 */
const EXPONENTS = {
  AED: 2, AFN: 2, ALL: 2, AMD: 2, ANG: 2, AOA: 2, ARS: 2, AUD: 2, AWG: 2, AZN: 2,
  BAM: 2, BBD: 2, BDT: 2, BGN: 2, BHD: 3, BIF: 0, BMD: 2, BND: 2, BOB: 2, BRL: 2,
  BSD: 2, BTN: 2, BWP: 2, BYN: 2, BZD: 2, CAD: 2, CDF: 2, CHF: 2, CLP: 0, CNY: 2,
  COP: 2, CRC: 2, CUP: 2, CVE: 2, CZK: 2, DJF: 0, DKK: 2, DOP: 2, DZD: 2, EGP: 2,
  ERN: 2, ETB: 2, EUR: 2, FJD: 2, FKP: 2, GBP: 2, GEL: 2, GHS: 2, GIP: 2, GMD: 2,
  GNF: 0, GTQ: 2, GYD: 2, HKD: 2, HNL: 2, HTG: 2, HUF: 2, IDR: 2, ILS: 2, INR: 2,
  IQD: 3, IRR: 2, ISK: 0, JMD: 2, JOD: 3, JPY: 0, KES: 2, KGS: 2, KHR: 2, KMF: 0,
  KPW: 2, KRW: 0, KWD: 3, KYD: 2, KZT: 2, LAK: 2, LBP: 2, LKR: 2, LRD: 2, LSL: 2,
  LYD: 3, MAD: 2, MDL: 2, MGA: 2, MKD: 2, MMK: 2, MNT: 2, MOP: 2, MRU: 2, MUR: 2,
  MVR: 2, MWK: 2, MXN: 2, MYR: 2, MZN: 2, NAD: 2, NGN: 2, NIO: 2, NOK: 2, NPR: 2,
  NZD: 2, OMR: 3, PAB: 2, PEN: 2, PGK: 2, PHP: 2, PKR: 2, PLN: 2, PYG: 0, QAR: 2,
  RON: 2, RSD: 2, RUB: 2, RWF: 0, SAR: 2, SBD: 2, SCR: 2, SDG: 2, SEK: 2, SGD: 2,
  SHP: 2, SLE: 2, SOS: 2, SRD: 2, SSP: 2, STN: 2, SVC: 2, SYP: 2, SZL: 2, THB: 2,
  TJS: 2, TMT: 2, TND: 3, TOP: 2, TRY: 2, TTD: 2, TWD: 2, TZS: 2, UAH: 2, UGX: 0,
  USD: 2, UYU: 2, UZS: 2, VED: 2, VES: 2, VND: 0, VUV: 0, WST: 2, XAF: 0, XCD: 2,
  XCG: 2, XOF: 0, XPF: 0, YER: 2, ZAR: 2, ZMW: 2, ZWG: 2,
} as const satisfies Record<string, 0 | 2 | 3>;

export type CurrencyCode = keyof typeof EXPONENTS;

export const CURRENCY_CODES = Object.keys(EXPONENTS).sort() as [CurrencyCode, ...CurrencyCode[]];

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.hasOwn(EXPONENTS, value);
}

export function assertCurrencyCode(value: string): CurrencyCode {
  if (!isCurrencyCode(value)) throw new UnknownCurrencyError(value);
  return value;
}

export function currencyExponent(currency: CurrencyCode): number {
  return EXPONENTS[currency];
}
```

Note: Biome will reformat the table one-entry-per-line; that's fine — run `pnpm format` before committing.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @everycent/money test`
Expected: PASS (4 tests).

- [ ] **Step 6: Write failing tests for money + rounding**

`packages/money/src/money.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CurrencyMismatchError } from "./errors";
import {
  add,
  compare,
  equals,
  isNegative,
  isPositive,
  isZero,
  money,
  negate,
  subtract,
  sum,
  zero,
} from "./money";

const usd = (n: bigint) => money(n, "USD");

describe("money arithmetic", () => {
  it("adds and subtracts same-currency amounts", () => {
    expect(add(usd(150n), usd(275n))).toEqual(usd(425n));
    expect(subtract(usd(150n), usd(275n))).toEqual(usd(-125n));
  });

  it("refuses to mix currencies", () => {
    expect(() => add(usd(1n), money(1n, "EUR"))).toThrow(CurrencyMismatchError);
    expect(() => subtract(usd(1n), money(1n, "EUR"))).toThrow(CurrencyMismatchError);
    expect(() => compare(usd(1n), money(1n, "EUR"))).toThrow(CurrencyMismatchError);
  });

  it("negates and classifies sign", () => {
    expect(negate(usd(5n))).toEqual(usd(-5n));
    expect(isZero(zero("USD"))).toBe(true);
    expect(isNegative(usd(-1n))).toBe(true);
    expect(isPositive(usd(1n))).toBe(true);
    expect(isPositive(usd(0n))).toBe(false);
  });

  it("compares and checks equality", () => {
    expect(compare(usd(1n), usd(2n))).toBe(-1);
    expect(compare(usd(2n), usd(2n))).toBe(0);
    expect(compare(usd(3n), usd(2n))).toBe(1);
    expect(equals(usd(2n), usd(2n))).toBe(true);
    expect(equals(usd(2n), money(2n, "EUR"))).toBe(false);
  });

  it("sums a list, including the empty list", () => {
    expect(sum([usd(1n), usd(2n), usd(3n)], "USD")).toEqual(usd(6n));
    expect(sum([], "USD")).toEqual(usd(0n));
    expect(() => sum([money(1n, "EUR")], "USD")).toThrow(CurrencyMismatchError);
  });

  it("produces immutable values", () => {
    expect(Object.isFrozen(usd(1n))).toBe(true);
  });
});
```

`packages/money/src/rounding.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { divideRounded } from "./rounding";

describe("divideRounded", () => {
  it("returns exact quotients unchanged", () => {
    expect(divideRounded(10n, 5n)).toBe(2n);
    expect(divideRounded(-10n, 5n)).toBe(-2n);
  });

  it("rounds half to even by default (banker's rounding)", () => {
    expect(divideRounded(25n, 10n)).toBe(2n); // 2.5 -> 2
    expect(divideRounded(35n, 10n)).toBe(4n); // 3.5 -> 4
    expect(divideRounded(-25n, 10n)).toBe(-2n);
    expect(divideRounded(-35n, 10n)).toBe(-4n);
    expect(divideRounded(26n, 10n)).toBe(3n);
    expect(divideRounded(24n, 10n)).toBe(2n);
  });

  it("supports half-up (away from zero), floor, ceil and trunc", () => {
    expect(divideRounded(25n, 10n, "half-up")).toBe(3n);
    expect(divideRounded(-25n, 10n, "half-up")).toBe(-3n);
    expect(divideRounded(-21n, 10n, "floor")).toBe(-3n);
    expect(divideRounded(21n, 10n, "floor")).toBe(2n);
    expect(divideRounded(21n, 10n, "ceil")).toBe(3n);
    expect(divideRounded(-21n, 10n, "ceil")).toBe(-2n);
    expect(divideRounded(-29n, 10n, "trunc")).toBe(-2n);
  });

  it("handles negative denominators and rejects zero", () => {
    expect(divideRounded(25n, -10n)).toBe(-2n);
    expect(() => divideRounded(1n, 0n)).toThrow(RangeError);
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `pnpm --filter @everycent/money test`
Expected: FAIL — cannot resolve `./money` / `./rounding`.

- [ ] **Step 8: Implement money + rounding**

`packages/money/src/money.ts`:
```ts
import type { CurrencyCode } from "./currency";
import { CurrencyMismatchError } from "./errors";

/** An exact monetary amount in the currency's minor units (e.g. cents). */
export interface Money {
  readonly amount: bigint;
  readonly currency: CurrencyCode;
}

export function money(amount: bigint, currency: CurrencyCode): Money {
  return Object.freeze({ amount, currency });
}

export function zero(currency: CurrencyCode): Money {
  return money(0n, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function negate(m: Money): Money {
  return money(-m.amount, m.currency);
}

export const isZero = (m: Money): boolean => m.amount === 0n;
export const isNegative = (m: Money): boolean => m.amount < 0n;
export const isPositive = (m: Money): boolean => m.amount > 0n;

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

/** Sums amounts; `currency` is required so an empty list still has a currency. */
export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce(add, zero(currency));
}
```

`packages/money/src/rounding.ts`:
```ts
export type RoundingMode = "half-even" | "half-up" | "floor" | "ceil" | "trunc";

/**
 * Integer division with explicit rounding. `half-up` rounds ties away from zero;
 * `half-even` (banker's rounding) rounds ties to the nearest even quotient.
 */
export function divideRounded(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode = "half-even",
): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");
  const num = denominator < 0n ? -numerator : numerator;
  const den = denominator < 0n ? -denominator : denominator;

  const quotient = num / den; // truncates toward zero
  const remainder = num % den; // has the sign of num
  if (remainder === 0n) return quotient;

  const awayFromZero = num < 0n ? quotient - 1n : quotient + 1n;
  switch (mode) {
    case "trunc":
      return quotient;
    case "floor":
      return num < 0n ? quotient - 1n : quotient;
    case "ceil":
      return num < 0n ? quotient : quotient + 1n;
    case "half-up":
    case "half-even": {
      const twiceRemainder = 2n * (remainder < 0n ? -remainder : remainder);
      if (twiceRemainder > den) return awayFromZero;
      if (twiceRemainder < den) return quotient;
      if (mode === "half-up") return awayFromZero;
      return quotient % 2n === 0n ? quotient : awayFromZero;
    }
  }
}
```

- [ ] **Step 9: Run to verify pass**

Run: `pnpm --filter @everycent/money test`
Expected: PASS.

- [ ] **Step 10: Write failing tests for parse/format (Review Focus 2 & 3)**

`packages/money/src/parse-format.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { MoneyParseError } from "./errors";
import { money } from "./money";
import { formatMoney, parseMoney, toDecimalString } from "./parse-format";

describe("parseMoney", () => {
  it("parses decimal strings into minor units", () => {
    expect(parseMoney("12.34", "USD")).toEqual(money(1234n, "USD"));
    expect(parseMoney("12.3", "USD")).toEqual(money(1230n, "USD"));
    expect(parseMoney("12", "USD")).toEqual(money(1200n, "USD"));
    expect(parseMoney(".5", "USD")).toEqual(money(50n, "USD"));
    expect(parseMoney("12.", "USD")).toEqual(money(1200n, "USD"));
    expect(parseMoney("-0.01", "USD")).toEqual(money(-1n, "USD"));
    expect(parseMoney("+7", "USD")).toEqual(money(700n, "USD"));
  });

  it("ignores grouping separators and surrounding whitespace", () => {
    expect(parseMoney(" 1,234,567.89 ", "USD")).toEqual(money(123456789n, "USD"));
    expect(parseMoney("1_000", "JPY")).toEqual(money(1000n, "JPY"));
  });

  it("respects the currency exponent", () => {
    expect(parseMoney("1500", "JPY")).toEqual(money(1500n, "JPY"));
    expect(parseMoney("1.234", "KWD")).toEqual(money(1234n, "KWD"));
  });

  it("rejects input it would otherwise have to round or guess", () => {
    for (const [input, currency] of [
      ["1.234", "USD"],
      ["1.5", "JPY"],
      ["abc", "USD"],
      ["", "USD"],
      ["-", "USD"],
      [".", "USD"],
      ["1.2.3", "USD"],
      ["1e5", "USD"],
      ["--1", "USD"],
    ] as const) {
      expect(() => parseMoney(input, currency), input).toThrow(MoneyParseError);
    }
  });

  it("parses amounts beyond Number.MAX_SAFE_INTEGER exactly", () => {
    expect(parseMoney("90071992547409931234.56", "USD")).toEqual(
      money(9007199254740993123456n, "USD"),
    );
  });
});

describe("toDecimalString", () => {
  it("renders minor units as an exact decimal string", () => {
    expect(toDecimalString(money(1234n, "USD"))).toBe("12.34");
    expect(toDecimalString(money(5n, "USD"))).toBe("0.05");
    expect(toDecimalString(money(-5n, "USD"))).toBe("-0.05");
    expect(toDecimalString(money(0n, "USD"))).toBe("0.00");
    expect(toDecimalString(money(1500n, "JPY"))).toBe("1500");
    expect(toDecimalString(money(1n, "KWD"))).toBe("0.001");
  });

  it("round-trips with parseMoney", () => {
    for (const s of ["0.00", "-123.45", "99999999999999999999.99"]) {
      expect(toDecimalString(parseMoney(s, "USD"))).toBe(s);
    }
  });
});

describe("formatMoney", () => {
  it("formats with the currency's fraction digits", () => {
    expect(formatMoney(money(123456n, "USD"))).toBe("$1,234.56");
    expect(formatMoney(money(-5n, "USD"))).toBe("-$0.05");
    expect(formatMoney(money(1235n, "JPY"))).toBe("¥1,235");
    expect(formatMoney(money(1234n, "KWD"), { currencyDisplay: "code" })).toMatch(/^KWD\s1\.234$/);
  });

  it("formats amounts beyond Number.MAX_SAFE_INTEGER exactly", () => {
    expect(formatMoney(money(9007199254740993123456n, "USD"))).toBe(
      "$90,071,992,547,409,931,234.56",
    );
  });
});
```

- [ ] **Step 11: Run to verify failure**

Run: `pnpm --filter @everycent/money test`
Expected: FAIL — cannot resolve `./parse-format`.

- [ ] **Step 12: Implement parse/format**

`packages/money/src/parse-format.ts`:
```ts
import { type CurrencyCode, currencyExponent } from "./currency";
import { MoneyParseError } from "./errors";
import { type Money, money } from "./money";

const DECIMAL = /^([+-])?(\d*)(?:\.(\d*))?$/;

/**
 * Parses a user-entered decimal string ("1,234.56") into exact minor units.
 * Uses "." as the decimal separator; "," "_" and whitespace are treated as grouping.
 * Never rounds: more fraction digits than the currency allows is an error.
 */
export function parseMoney(input: string, currency: CurrencyCode): Money {
  const cleaned = input.trim().replace(/[,_\s]/g, "");
  const match = DECIMAL.exec(cleaned);
  const whole = match?.[2] ?? "";
  const fraction = match?.[3] ?? "";
  if (!match || (whole === "" && fraction === "")) {
    throw new MoneyParseError(input, "not a decimal number");
  }

  const exponent = currencyExponent(currency);
  if (fraction.length > exponent) {
    throw new MoneyParseError(input, `${currency} allows at most ${exponent} decimal places`);
  }

  const magnitude = BigInt(`${whole || "0"}${fraction.padEnd(exponent, "0")}`);
  return money(match[1] === "-" ? -magnitude : magnitude, currency);
}

/** Exact decimal representation, e.g. 1234n USD -> "12.34". Never goes through a float. */
export function toDecimalString(m: Money): string {
  const exponent = currencyExponent(m.currency);
  const negative = m.amount < 0n;
  const digits = (negative ? -m.amount : m.amount).toString().padStart(exponent + 1, "0");
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${negative ? "-" : ""}${whole}${exponent > 0 ? `.${fraction}` : ""}`;
}

export interface FormatMoneyOptions {
  locale?: string;
  currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name";
}

export function formatMoney(m: Money, options: FormatMoneyOptions = {}): string {
  const exponent = currencyExponent(m.currency);
  const formatter = new Intl.NumberFormat(options.locale ?? "en-US", {
    style: "currency",
    currency: m.currency,
    currencyDisplay: options.currencyDisplay ?? "symbol",
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
  // Intl.NumberFormat formats numeric strings exactly (ES2023), so no float precision loss.
  return formatter.format(toDecimalString(m) as `${number}`);
}
```

- [ ] **Step 13: Run to verify pass**

Run: `pnpm --filter @everycent/money test`
Expected: PASS. (If the KWD code-display test fails only because of a different whitespace character, the regex already allows `\s`; if Intl output differs otherwise, inspect and fix the implementation, not the test.)

- [ ] **Step 14: Write failing tests for fx + allocate + wire**

`packages/money/src/fx.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { convert } from "./fx";
import { money } from "./money";

describe("convert", () => {
  it("converts between two-decimal currencies", () => {
    expect(convert(money(10000n, "USD"), "0.9235", "EUR")).toEqual(money(9235n, "EUR"));
  });

  it("converts into and out of zero-decimal currencies", () => {
    expect(convert(money(100n, "USD"), "149.5", "JPY")).toEqual(money(150n, "JPY")); // 149.5 -> 150 (even)
    expect(convert(money(1000n, "JPY"), "0.0067", "USD")).toEqual(money(670n, "USD"));
  });

  it("uses banker's rounding by default and honours an explicit mode", () => {
    // 0.05 USD * 0.5 = 0.025 -> tie
    expect(convert(money(5n, "USD"), "0.5", "EUR")).toEqual(money(2n, "EUR"));
    expect(convert(money(5n, "USD"), "0.5", "EUR", "half-up")).toEqual(money(3n, "EUR"));
    expect(convert(money(-5n, "USD"), "0.5", "EUR")).toEqual(money(-2n, "EUR"));
    expect(convert(money(-5n, "USD"), "0.5", "EUR", "half-up")).toEqual(money(-3n, "EUR"));
  });

  it("rejects malformed or non-positive rates", () => {
    for (const rate of ["", "abc", "-1", "0", "0.000", "1e3", "1.", ".5"]) {
      expect(() => convert(money(1n, "USD"), rate, "EUR"), rate).toThrow(RangeError);
    }
  });
});
```

`packages/money/src/allocate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { allocate } from "./allocate";
import { money, sum } from "./money";

const usd = (n: bigint) => money(n, "USD");

describe("allocate", () => {
  it("splits without losing a cent, giving leftovers to the largest remainders first", () => {
    expect(allocate(usd(100n), [1, 1, 1])).toEqual([usd(34n), usd(33n), usd(33n)]);
    expect(allocate(usd(100n), [70, 30])).toEqual([usd(70n), usd(30n)]);
    expect(allocate(usd(5n), [3, 7])).toEqual([usd(2n), usd(3n)]); // 1.5 / 3.5 -> tie broken by index
  });

  it("mirrors the split for negative amounts", () => {
    expect(allocate(usd(-100n), [1, 1, 1])).toEqual([usd(-34n), usd(-33n), usd(-33n)]);
  });

  it("never gives anything to a zero ratio", () => {
    expect(allocate(usd(5n), [0, 1])).toEqual([usd(0n), usd(5n)]);
  });

  it("always preserves the total", () => {
    for (let amount = -250n; amount <= 250n; amount += 7n) {
      const parts = allocate(usd(amount), [3, 5, 11, 1]);
      expect(sum(parts, "USD")).toEqual(usd(amount));
    }
  });

  it("rejects empty, negative, fractional or all-zero ratios", () => {
    expect(() => allocate(usd(1n), [])).toThrow(RangeError);
    expect(() => allocate(usd(1n), [-1, 2])).toThrow(RangeError);
    expect(() => allocate(usd(1n), [1.5, 2])).toThrow(RangeError);
    expect(() => allocate(usd(1n), [0, 0])).toThrow(RangeError);
  });
});
```

`packages/money/src/wire.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { money } from "./money";
import { fromWire, toWire, zMoney } from "./wire";

describe("wire format", () => {
  it("serializes amounts as integer strings", () => {
    expect(toWire(money(-12345n, "USD"))).toEqual({ amount: "-12345", currency: "USD" });
    expect(fromWire({ amount: "90071992547409931234", currency: "JPY" })).toEqual(
      money(90071992547409931234n, "JPY"),
    );
  });

  it("validates wire payloads", () => {
    expect(zMoney.safeParse({ amount: "100", currency: "USD" }).success).toBe(true);
    expect(zMoney.safeParse({ amount: "0", currency: "USD" }).success).toBe(true);
    for (const bad of [
      { amount: 100, currency: "USD" },
      { amount: "1.00", currency: "USD" },
      { amount: "01", currency: "USD" },
      { amount: "-0", currency: "USD" },
      { amount: "", currency: "USD" },
      { amount: "100", currency: "usd" },
      { amount: "100", currency: "XXX" },
    ]) {
      expect(zMoney.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
```

- [ ] **Step 15: Run to verify failure**

Run: `pnpm --filter @everycent/money test`
Expected: FAIL — cannot resolve `./fx`, `./allocate`, `./wire`.

- [ ] **Step 16: Implement fx, allocate, wire, index**

`packages/money/src/fx.ts`:
```ts
import { type CurrencyCode, currencyExponent } from "./currency";
import { type Money, money } from "./money";
import { divideRounded, type RoundingMode } from "./rounding";

const RATE = /^(\d+)(?:\.(\d+))?$/;

/**
 * Converts `m` into `target` using a decimal-string rate ("1 unit of m.currency = rate units of
 * target"). Computed with scaled bigint arithmetic; rounding happens exactly once.
 */
export function convert(
  m: Money,
  rate: string,
  target: CurrencyCode,
  mode: RoundingMode = "half-even",
): Money {
  const match = RATE.exec(rate);
  if (!match) throw new RangeError(`Invalid FX rate "${rate}"`);
  const fraction = match[2] ?? "";
  const scaledRate = BigInt(`${match[1]}${fraction}`);
  if (scaledRate === 0n) throw new RangeError("FX rate must be greater than zero");

  const numerator = m.amount * scaledRate * 10n ** BigInt(currencyExponent(target));
  const denominator = 10n ** BigInt(fraction.length + currencyExponent(m.currency));
  return money(divideRounded(numerator, denominator, mode), target);
}
```

`packages/money/src/allocate.ts`:
```ts
import { type Money, money } from "./money";

/**
 * Splits `m` proportionally to non-negative integer `ratios` without losing a minor unit
 * (largest-remainder method; ties go to the earlier index).
 */
export function allocate(m: Money, ratios: readonly (number | bigint)[]): Money[] {
  if (ratios.length === 0) throw new RangeError("allocate requires at least one ratio");
  const weights = ratios.map((ratio) => {
    if (typeof ratio === "number" && !Number.isInteger(ratio)) {
      throw new RangeError(`Ratios must be integers, got ${ratio}`);
    }
    const weight = BigInt(ratio);
    if (weight < 0n) throw new RangeError(`Ratios must be non-negative, got ${ratio}`);
    return weight;
  });
  const total = weights.reduce((a, b) => a + b, 0n);
  if (total === 0n) throw new RangeError("Ratios must not all be zero");

  const negative = m.amount < 0n;
  const magnitude = negative ? -m.amount : m.amount;
  const shares = weights.map((w) => (magnitude * w) / total);
  let leftover = magnitude - shares.reduce((a, b) => a + b, 0n);

  const byRemainder = weights
    .map((w, index) => ({ index, remainder: (magnitude * w) % total }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
  for (const { index } of byRemainder) {
    if (leftover === 0n) break;
    shares[index] = (shares[index] ?? 0n) + 1n;
    leftover -= 1n;
  }

  return shares.map((share) => money(negative ? -share : share, m.currency));
}
```

`packages/money/src/wire.ts`:
```ts
import { z } from "zod";
import { CURRENCY_CODES, type CurrencyCode } from "./currency";
import { type Money, money } from "./money";

export const zCurrencyCode = z.enum(CURRENCY_CODES).describe("ISO 4217 currency code");

/** Integer amount in minor units, as a string (JSON numbers cannot hold every bigint). */
export const zMinorUnits = z
  .string()
  .regex(/^(0|-?[1-9]\d*)$/, "Expected an integer amount in minor units, as a string")
  .describe("Amount in the currency's minor units (e.g. cents), as an integer string");

export const zMoney = z.object({ amount: zMinorUnits, currency: zCurrencyCode });

export interface MoneyWire {
  amount: string;
  currency: CurrencyCode;
}

export function toWire(m: Money): MoneyWire {
  return { amount: m.amount.toString(), currency: m.currency };
}

export function fromWire(wire: MoneyWire): Money {
  return money(BigInt(zMinorUnits.parse(wire.amount)), wire.currency);
}
```

`packages/money/src/index.ts`:
```ts
export { allocate } from "./allocate";
export {
  assertCurrencyCode,
  CURRENCY_CODES,
  type CurrencyCode,
  currencyExponent,
  isCurrencyCode,
} from "./currency";
export {
  CurrencyMismatchError,
  MoneyError,
  MoneyParseError,
  UnknownCurrencyError,
} from "./errors";
export { convert } from "./fx";
export {
  add,
  compare,
  equals,
  isNegative,
  isPositive,
  isZero,
  type Money,
  money,
  negate,
  subtract,
  sum,
  zero,
} from "./money";
export {
  type FormatMoneyOptions,
  formatMoney,
  parseMoney,
  toDecimalString,
} from "./parse-format";
export { divideRounded, type RoundingMode } from "./rounding";
export { fromWire, type MoneyWire, toWire, zCurrencyCode, zMinorUnits, zMoney } from "./wire";
```

- [ ] **Step 17: Run all money checks**

Run:
```bash
pnpm --filter @everycent/money test
pnpm --filter @everycent/money typecheck
pnpm format && pnpm lint
```
Expected: all tests PASS, typecheck clean, lint clean.

- [ ] **Step 18: Commit**

```bash
git add -A
git commit -m "feat(money): exact bigint money library with ISO-4217 table, FX and allocation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: `@everycent/db` — Drizzle schema, client, migrations

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`
- Create: `packages/db/src/{index,client,id,migrate,migrate-cli}.ts`, `packages/db/src/schema/{index,columns,auth}.ts`
- Generated: `packages/db/migrations/*`
- Test: `packages/db/src/id.test.ts`

**Interfaces:**
- Produces:
  - `createDb(url: string, options?: { max?: number }): { db: Database; close: () => Promise<void> }`
  - `type Database` (Drizzle postgres-js db with schema, `casing: "snake_case"`)
  - `newId(): string` (UUIDv7)
  - `runMigrations(url: string): Promise<void>`, `MIGRATIONS_FOLDER: string`
  - `@everycent/db/schema` exports `user`, `session`, `account`, `verification` tables and `timestamps` column helper
  - `sql` re-exported from `drizzle-orm` for convenience

- [ ] **Step 1: Package scaffolding**

`packages/db/package.json`:
```json
{
  "name": "@everycent/db",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts"
  },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/migrate-cli.ts",
    "db:studio": "drizzle-kit studio",
    "typecheck": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "drizzle-orm": "catalog:",
    "postgres": "catalog:",
    "uuid": "catalog:"
  },
  "devDependencies": {
    "@everycent/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "drizzle-kit": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/db/tsconfig.json`:
```json
{
  "extends": "@everycent/tsconfig/node.json",
  "include": ["src", "drizzle.config.ts"]
}
```

Run: `pnpm install`

- [ ] **Step 2: Write failing test for ids**

`packages/db/src/id.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { newId } from "./id";

describe("newId", () => {
  it("returns a UUIDv7", () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("is time-ordered so ids sort by creation", () => {
    const ids = Array.from({ length: 50 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
  });
});
```

Run: `pnpm --filter @everycent/db test` → Expected: FAIL (cannot resolve `./id`).

- [ ] **Step 3: Implement id, schema, client, migrate**

`packages/db/src/id.ts`:
```ts
import { v7 } from "uuid";

/** Primary keys for every table: time-ordered UUIDv7 strings, generated in app code. */
export function newId(): string {
  return v7();
}
```

`packages/db/src/schema/columns.ts`:
```ts
import { timestamp } from "drizzle-orm/pg-core";

/** Standard audit columns. Spread into every table. */
export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
```

`packages/db/src/schema/auth.ts`:
```ts
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { timestamps } from "./columns";

// Better Auth core tables. Field names must match Better Auth's model fields exactly;
// column names come out snake_case via the shared `casing` setting.

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
```

`packages/db/src/schema/index.ts`:
```ts
export * from "./auth";
export { timestamps } from "./columns";
```

`packages/db/src/client.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export interface CreateDbOptions {
  /** Max pool size. Default 10. */
  max?: number;
}

/**
 * Creates a Drizzle client. postgres.js connects lazily, so this never touches the network
 * until the first query (the OpenAPI emit script relies on that).
 */
export function createDb(url: string, { max = 10 }: CreateDbOptions = {}) {
  const client = postgres(url, { max, onnotice: () => {} });
  const db = drizzle({ client, schema, casing: "snake_case" });
  return { db, close: () => client.end({ timeout: 5 }) };
}

export type Database = ReturnType<typeof createDb>["db"];
```

`packages/db/src/migrate.ts`:
```ts
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

export async function runMigrations(url: string): Promise<void> {
  const { db, close } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await close();
  }
}
```

`packages/db/src/migrate-cli.ts`:
```ts
import { existsSync } from "node:fs";
import { runMigrations } from "./migrate";

const envFile = new URL("../../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

await runMigrations(url);
console.log("Migrations applied");
```

`packages/db/src/index.ts`:
```ts
export { sql } from "drizzle-orm";
export { type CreateDbOptions, createDb, type Database } from "./client";
export { newId } from "./id";
export { MIGRATIONS_FOLDER, runMigrations } from "./migrate";
```

`packages/db/drizzle.config.ts`:
```ts
import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 4: Run id tests + typecheck**

Run:
```bash
pnpm --filter @everycent/db test
pnpm --filter @everycent/db typecheck
```
Expected: PASS, clean.

- [ ] **Step 5: Generate the initial migration and apply it**

Run:
```bash
pnpm --filter @everycent/db exec drizzle-kit generate --name init
pnpm db:migrate
docker compose exec postgres psql -U everycent -d everycent -Atc "\dt public.*"
docker compose exec postgres psql -U everycent -d everycent -Atc "\d public.session" | head -20
```
Expected: `migrations/0000_init.sql` + `migrations/meta/*` created; "Migrations applied"; tables `account`, `session`, `user`, `verification`; `session` columns are snake_case (`expires_at`, `user_id`, `ip_address`, …) with `timestamp with time zone`.

- [ ] **Step 6: Cross-check the schema against Better Auth's expectations**

Run (after Task 5 exists this is re-checked there; here just confirm fields match the Better Auth docs "Core Schema" page via context7 `/better-auth/better-auth` query "core schema user session account verification fields"). Every field in the docs' core schema must exist here with the same name and nullability. Fix and regenerate the migration (delete `migrations/` and re-run Step 5 — nothing has shipped yet) if not.

- [ ] **Step 7: Commit**

```bash
pnpm format && pnpm lint
git add -A
git commit -m "feat(db): drizzle client, better-auth schema, uuidv7 ids and initial migration

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `@everycent/api` core — app factory, errors, OpenAPI docs, health

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsdown.config.ts`, `apps/api/vitest.config.ts`
- Create: `apps/api/src/{index,app,types,env,load-env}.ts`, `apps/api/src/lib/{errors,router,docs}.ts`
- Create: `apps/api/src/routes/health/{routes,handlers,index}.ts`
- Create: `apps/api/test/{global-setup,helpers}.ts`
- Test: `apps/api/src/env.test.ts`, `apps/api/src/lib/errors.test.ts`, `apps/api/src/routes/health/health.test.ts`

**Interfaces:**
- Consumes: `createDb`, `Database`, `sql`, `runMigrations` from `@everycent/db`.
- Produces:
  - `parseEnv(source?: Record<string, string | undefined>): Env`; `type Env = { NODE_ENV; PORT: number; DATABASE_URL; BETTER_AUTH_SECRET; BETTER_AUTH_URL; WEB_ORIGIN }`
  - `loadRootEnv(): void`
  - `interface AppDeps { db: Database; env: Env }` (Task 5 adds `auth`), `type AppEnv = { Variables: { deps: AppDeps } }`
  - `createApp(deps: AppDeps): OpenAPIHono<AppEnv>`, `type App`
  - `createRouter(): OpenAPIHono<AppEnv>` (shared validation hook)
  - `AppError(status, code, message, details?)`, `ErrorSchema`, `errorBody(code, message, details?)`, `jsonError(description)`, `onError`, `notFound`
  - `OPENAPI_CONFIG`, `registerDocs(app)`, `buildOpenApiDocument(app)`
  - test helpers: `createTestApp(): { app, db, close }`, `resetDatabase(db)`, `testEnv()`

- [ ] **Step 1: Package scaffolding**

`apps/api/package.json`:
```json
{
  "name": "@everycent/api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --clear-screen=false src/index.ts",
    "build": "tsdown",
    "start": "node dist/index.mjs",
    "typecheck": "tsc",
    "test": "vitest run",
    "openapi:emit": "tsx src/scripts/emit-openapi.ts",
    "db:seed": "tsx src/scripts/seed.ts"
  },
  "dependencies": {
    "@everycent/db": "workspace:*",
    "@everycent/money": "workspace:*",
    "@hono/node-server": "catalog:",
    "@hono/zod-openapi": "catalog:",
    "@scalar/hono-api-reference": "catalog:",
    "hono": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@everycent/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "tsdown": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "@everycent/tsconfig/node.json",
  "include": ["src", "test", "tsdown.config.ts", "vitest.config.ts"]
}
```

`apps/api/tsdown.config.ts`:
```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  clean: true,
  // Workspace packages ship TypeScript source, so they must be bundled into the server.
  noExternal: [/^@everycent\//],
});
```

`apps/api/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    // All API test files share one Postgres database.
    fileParallelism: false,
  },
});
```

Run: `pnpm install`

- [ ] **Step 2: Write failing env test**

`apps/api/src/env.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:5173",
  WEB_ORIGIN: "http://localhost:5173",
};

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe("development");
  });

  it("coerces PORT", () => {
    expect(parseEnv({ ...valid, PORT: "8080" }).PORT).toBe(8080);
  });

  it("fails fast naming the bad variables", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: undefined, BETTER_AUTH_SECRET: "short" })).toThrow(
      /DATABASE_URL[\s\S]*BETTER_AUTH_SECRET|BETTER_AUTH_SECRET[\s\S]*DATABASE_URL/,
    );
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @everycent/api exec vitest run src/env.test.ts`
Expected: FAIL (cannot resolve `./env`; global setup may also fail — create a stub `test/global-setup.ts` exporting `export default async function setup() {}` first so only the import fails).

- [ ] **Step 4: Implement env + load-env**

`apps/api/src/env.ts`:
```ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
```

`apps/api/src/load-env.ts`:
```ts
import { existsSync } from "node:fs";

/** Loads the monorepo root `.env` in development/test. Existing env vars win. */
export function loadRootEnv(): void {
  const file = new URL("../../../.env", import.meta.url);
  if (existsSync(file)) process.loadEnvFile(file);
}
```

Run: `pnpm --filter @everycent/api exec vitest run src/env.test.ts` → Expected: PASS.

- [ ] **Step 5: Write failing tests for errors + router validation hook**

`apps/api/src/lib/errors.test.ts`:
```ts
import { createRoute, z } from "@hono/zod-openapi";
import { describe, expect, it, vi } from "vitest";
import { AppError, notFound, onError } from "./errors";
import { createRouter } from "./router";

function buildTestRouter() {
  const router = createRouter();
  router.onError(onError);
  router.notFound(notFound);
  router.openapi(
    createRoute({
      method: "get",
      path: "/items",
      request: { query: z.object({ limit: z.coerce.number().int().min(1) }) },
      responses: { 200: { description: "ok" } },
    }),
    (c) => c.body(null, 200),
  );
  router.get("/app-error", () => {
    throw new AppError(409, "CONFLICT", "Already exists", { field: "email" });
  });
  router.get("/boom", () => {
    throw new Error("secret internal detail");
  });
  return router;
}

describe("error handling", () => {
  it("turns validation failures into a 400 VALIDATION_ERROR with issue details", async () => {
    const res = await buildTestRouter().request("/items?limit=abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual([
      expect.objectContaining({ path: "limit", message: expect.any(String) }),
    ]);
  });

  it("renders AppError with its status, code and details", async () => {
    const res = await buildTestRouter().request("/app-error");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "CONFLICT", message: "Already exists", details: { field: "email" } },
    });
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await buildTestRouter().request("/boom");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("secret internal detail");
    expect(JSON.parse(text).error.code).toBe("INTERNAL_ERROR");
    spy.mockRestore();
  });

  it("renders unknown routes as 404 NOT_FOUND", async () => {
    const res = await buildTestRouter().request("/nope");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
```
Run: `pnpm --filter @everycent/api exec vitest run src/lib/errors.test.ts` → Expected: FAIL (modules missing).

- [ ] **Step 6: Implement types, errors, router**

`apps/api/src/types.ts`:
```ts
import type { Database } from "@everycent/db";
import type { Env } from "./env";

/** Everything a request handler may need. Injected once in createApp; read via c.var.deps. */
export interface AppDeps {
  db: Database;
  env: Env;
}

export type AppEnv = {
  Variables: {
    deps: AppDeps;
  };
};
```

`apps/api/src/lib/errors.ts`:
```ts
import { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "VALIDATION_ERROR" }),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi("Error");

export type ErrorBody = z.infer<typeof ErrorSchema>;

/** Throw from handlers/middleware for expected failures; rendered by onError. */
export class AppError extends Error {
  override name = "AppError";
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function errorBody(code: string, message: string, details?: unknown): ErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/** OpenAPI response entry for an error status. */
export function jsonError(description: string) {
  return { description, content: { "application/json": { schema: ErrorSchema } } };
}

const STATUS_CODES: Partial<Record<number, string>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
};

export function onError(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json(errorBody(err.code, err.message, err.details), err.status);
  }
  if (err instanceof HTTPException) {
    const code = STATUS_CODES[err.status] ?? "HTTP_ERROR";
    return c.json(errorBody(code, err.message || "Request failed"), err.status);
  }
  console.error(`[${c.get("requestId") ?? "-"}] Unhandled error`, err);
  return c.json(errorBody("INTERNAL_ERROR", "Something went wrong"), 500);
}

export function notFound(c: Context) {
  return c.json(errorBody("NOT_FOUND", `Route ${c.req.method} ${c.req.path} not found`), 404);
}
```

`apps/api/src/lib/router.ts`:
```ts
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../types";
import { errorBody } from "./errors";

/** Every router in the API must be created here so validation errors share one shape. */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
          code: issue.code,
        }));
        return c.json(errorBody("VALIDATION_ERROR", "Request validation failed", details), 400);
      }
    },
  });
}
```

Run: `pnpm --filter @everycent/api exec vitest run src/lib/errors.test.ts` → Expected: PASS.

- [ ] **Step 7: Write test helpers + global setup**

`apps/api/test/global-setup.ts`:
```ts
import { runMigrations } from "@everycent/db";
import { loadRootEnv } from "../src/load-env";

export default async function setup() {
  loadRootEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  await runMigrations(url);
}
```

`apps/api/test/helpers.ts`:
```ts
import { createDb, type Database, sql } from "@everycent/db";
import { createApp } from "../src/app";
import { type Env, parseEnv } from "../src/env";
import { loadRootEnv } from "../src/load-env";

export function testEnv(): Env {
  loadRootEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  return parseEnv({
    NODE_ENV: "test",
    DATABASE_URL: url,
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-chars-long",
    BETTER_AUTH_URL: "http://localhost:3000",
    WEB_ORIGIN: "http://localhost:5173",
  });
}

export function createTestApp() {
  const env = testEnv();
  const { db, close } = createDb(env.DATABASE_URL, { max: 2 });
  const app = createApp({ db, env });
  return { app, db, env, close };
}

/** Empties every table in the public schema (future tables included automatically). */
export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
}
```

- [ ] **Step 8: Write failing health/app tests**

`apps/api/src/routes/health/health.test.ts`:
```ts
import { createDb } from "@everycent/db";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createTestApp, testEnv } from "../../../test/helpers";
import { createApp } from "../../app";

const { app, close } = createTestApp();
afterAll(close);

describe("GET /v1/health", () => {
  it("reports ok when the database is reachable", async () => {
    const res = await app.request("/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("returns 503 in the standard error shape when the database is down", async () => {
    const env = testEnv();
    const broken = createDb("postgres://nobody:nothing@127.0.0.1:1/none", { max: 1 });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await createApp({ db: broken.db, env }).request("/v1/health");
    spy.mockRestore();
    await broken.close();
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("DATABASE_UNAVAILABLE");
  });
});

describe("app wiring", () => {
  it("serves the OpenAPI document including /v1/health", async () => {
    const res = await app.request("/openapi.json");
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(doc.paths["/v1/health"].get.operationId).toBe("getHealth");
  });

  it("serves the API reference UI", async () => {
    const res = await app.request("/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("allows credentialed CORS from the web origin", async () => {
    const res = await app.request("/v1/health", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("returns JSON 404s for unknown routes", async () => {
    const res = await app.request("/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("tags responses with a request id", async () => {
    const res = await app.request("/v1/health");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});
```

Run: `pnpm --filter @everycent/api test` → Expected: FAIL (`../../app` missing).

- [ ] **Step 9: Implement docs, health route, createApp, server entry**

`apps/api/src/lib/docs.ts`:
```ts
import type { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import type { AppEnv } from "../types";

export const OPENAPI_CONFIG = {
  openapi: "3.1.0",
  info: {
    title: "everycent API",
    version: "0.1.0",
    description:
      "Zero-based budgeting API. Money amounts are integer strings in the currency's minor units.",
  },
} as const;

export function registerDocs(app: OpenAPIHono<AppEnv>): void {
  app.doc31("/openapi.json", OPENAPI_CONFIG);
  app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "everycent API" }));
}

export function buildOpenApiDocument(app: OpenAPIHono<AppEnv>) {
  return app.getOpenAPI31Document(OPENAPI_CONFIG);
}
```

`apps/api/src/routes/health/routes.ts`:
```ts
import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";

export const HealthSchema = z
  .object({ status: z.literal("ok"), database: z.literal("ok") })
  .openapi("Health");

export const getHealth = createRoute({
  method: "get",
  path: "/health",
  operationId: "getHealth",
  tags: ["System"],
  summary: "Service health",
  responses: {
    200: {
      description: "The API and its database are healthy",
      content: { "application/json": { schema: HealthSchema } },
    },
    503: jsonError("The database is unreachable"),
  },
});
```

`apps/api/src/routes/health/handlers.ts`:
```ts
import { sql } from "@everycent/db";
import type { RouteHandler } from "@hono/zod-openapi";
import { errorBody } from "../../lib/errors";
import type { AppEnv } from "../../types";
import type { getHealth } from "./routes";

export const getHealthHandler: RouteHandler<typeof getHealth, AppEnv> = async (c) => {
  try {
    await c.var.deps.db.execute(sql`select 1`);
  } catch (err) {
    console.error("Health check: database unreachable", err);
    return c.json(errorBody("DATABASE_UNAVAILABLE", "Database is unreachable"), 503);
  }
  return c.json({ status: "ok", database: "ok" } as const, 200);
};
```

`apps/api/src/routes/health/index.ts`:
```ts
import { createRouter } from "../../lib/router";
import { getHealthHandler } from "./handlers";
import { getHealth } from "./routes";

export const healthRouter = createRouter().openapi(getHealth, getHealthHandler);
```

`apps/api/src/app.ts`:
```ts
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { registerDocs } from "./lib/docs";
import { notFound, onError } from "./lib/errors";
import { createRouter } from "./lib/router";
import { healthRouter } from "./routes/health";
import type { AppDeps } from "./types";

export function createApp(deps: AppDeps) {
  const app = createRouter();

  app.use("*", requestId());
  if (deps.env.NODE_ENV !== "test") app.use("*", logger());
  app.use("*", secureHeaders());
  app.use("*", cors({ origin: deps.env.WEB_ORIGIN, credentials: true }));
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  app.onError(onError);
  app.notFound(notFound);

  app.route("/v1", healthRouter);

  registerDocs(app);
  return app;
}

export type App = ReturnType<typeof createApp>;
```

`apps/api/src/index.ts`:
```ts
import { createDb } from "@everycent/db";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { parseEnv } from "./env";
import { loadRootEnv } from "./load-env";

if (process.env.NODE_ENV !== "production") loadRootEnv();

const env = parseEnv();
const { db, close } = createDb(env.DATABASE_URL);
const app = createApp({ db, env });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`everycent API on http://localhost:${info.port} — docs at /docs`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await close();
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
```

- [ ] **Step 10: Run all API checks**

Run:
```bash
pnpm --filter @everycent/api test
pnpm --filter @everycent/api typecheck
pnpm --filter @everycent/api build
```
Expected: all tests PASS; typecheck clean; `apps/api/dist/index.mjs` built. If `tsdown`'s `noExternal` option was renamed in the installed version, use the equivalent from its types.

- [ ] **Step 11: Smoke test the running server**

Run `pnpm --filter @everycent/api dev` in the background (run_in_background), then:
```bash
curl -s localhost:3000/v1/health
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/docs
```
Expected: `{"status":"ok","database":"ok"}` and `200`. Stop the server.

- [ ] **Step 12: Commit**

```bash
pnpm format && pnpm lint
git add -A
git commit -m "feat(api): hono app factory with zod-openapi, error model, docs and health check

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Better Auth + `requireAuth` + `GET /v1/me` + seed

**Files:**
- Create: `apps/api/src/lib/auth.ts`, `apps/api/src/middleware/require-auth.ts`
- Create: `apps/api/src/routes/me/{routes,handlers,index}.ts`, `apps/api/src/scripts/seed.ts`
- Modify: `apps/api/package.json` (add `better-auth`), `apps/api/src/types.ts`, `apps/api/src/app.ts`, `apps/api/src/lib/docs.ts`, `apps/api/src/index.ts`, `apps/api/test/helpers.ts`, `apps/api/src/routes/health/health.test.ts`
- Test: `apps/api/src/routes/me/me.test.ts`

**Interfaces:**
- Consumes: `newId`, `Database` from `@everycent/db`; `@everycent/db/schema`; `AppError`, `jsonError`, `createRouter` from Task 4.
- Produces:
  - `createAuth(db: Database, env: Env)`, `type Auth`, `type AuthUser`, `type AuthSession`
  - `AppDeps` becomes `{ db: Database; env: Env; auth: Auth }`
  - `requireAuth` middleware; `type AuthedEnv = { Variables: { user: AuthUser; session: AuthSession } }`
  - `GET /v1/me` → `User` schema `{ id, name, email, emailVerified, image: string | null, createdAt: string (ISO) }`
  - OpenAPI security scheme `cookieAuth`
  - test helper `signUp(app, input?): Promise<{ cookie: string; email: string }>`

- [ ] **Step 1: Add dependency**

In `apps/api/package.json` `dependencies` add `"better-auth": "catalog:"`, then run `pnpm install`.

- [ ] **Step 2: Implement auth + wire deps**

`apps/api/src/lib/auth.ts`:
```ts
import { type Database, newId } from "@everycent/db";
import * as schema from "@everycent/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Env } from "../env";

export function createAuth(db: Database, env: Env) {
  return betterAuth({
    appName: "everycent",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, autoSignIn: true },
    advanced: { database: { generateId: () => newId() } },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthUser = Auth["$Infer"]["Session"]["user"];
export type AuthSession = Auth["$Infer"]["Session"]["session"];
```

Modify `apps/api/src/types.ts` to:
```ts
import type { Database } from "@everycent/db";
import type { Env } from "./env";
import type { Auth } from "./lib/auth";

/** Everything a request handler may need. Injected once in createApp; read via c.var.deps. */
export interface AppDeps {
  db: Database;
  env: Env;
  auth: Auth;
}

export type AppEnv = {
  Variables: {
    deps: AppDeps;
  };
};
```

In `apps/api/src/app.ts`, after `app.notFound(notFound);` add (Better Auth must be mounted before our routers):
```ts
  app.on(["GET", "POST"], "/api/auth/*", (c) => c.var.deps.auth.handler(c.req.raw));
```
and mount the me router after health: `app.route("/v1", meRouter);` with `import { meRouter } from "./routes/me";`.

In `apps/api/src/index.ts` replace `const app = createApp({ db, env });` with:
```ts
const app = createApp({ db, env, auth: createAuth(db, env) });
```
(add `import { createAuth } from "./lib/auth";`).

In `apps/api/test/helpers.ts` replace `const app = createApp({ db, env });` with `const app = createApp({ db, env, auth: createAuth(db, env) });` (import `createAuth` from `../src/lib/auth`), and append:
```ts
import type { App } from "../src/app";

export async function signUp(
  app: App,
  input: { email?: string; password?: string; name?: string } = {},
): Promise<{ cookie: string; email: string }> {
  const email = input.email ?? `user-${crypto.randomUUID()}@example.com`;
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:5173" },
    body: JSON.stringify({
      email,
      password: input.password ?? "correct-horse-battery",
      name: input.name ?? "Test User",
    }),
  });
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { cookie, email };
}
```
(Move the `import type { App }` to the top with the other imports.)

In `apps/api/src/routes/health/health.test.ts`, the broken-DB app now needs auth: change to `createApp({ db: broken.db, env, auth: createAuth(broken.db, env) })` and import `createAuth` from `../../lib/auth`.

- [ ] **Step 3: Write failing tests for /v1/me (includes Review Focus 4 & 5)**

`apps/api/src/routes/me/me.test.ts`:
```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetDatabase, signUp } from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

describe("GET /v1/me", () => {
  it("returns 401 in the standard error shape without a session", async () => {
    const res = await app.request("/v1/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  });

  it("returns 401 (not 500) for a garbage session cookie", async () => {
    const res = await app.request("/v1/me", {
      headers: { cookie: "better-auth.session_token=not-a-real-token.bad-signature" },
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("returns the signed-in user", async () => {
    const { cookie, email } = await signUp(app, { name: "Ada Lovelace" });
    const res = await app.request("/v1/me", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ name: "Ada Lovelace", email, emailVerified: false, image: null });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
  });

  it("rejects a duplicate sign-up with a client error, not a 500", async () => {
    const { email } = await signUp(app);
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ email, password: "another-password-123", name: "Dup" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("rejects a wrong password", async () => {
    const { email } = await signUp(app);
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ email, password: "definitely-wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("is documented as cookie-authenticated", async () => {
    const doc = await (await app.request("/openapi.json")).json();
    expect(doc.components.securitySchemes.cookieAuth).toMatchObject({ type: "apiKey", in: "cookie" });
    expect(doc.paths["/v1/me"].get.security).toEqual([{ cookieAuth: [] }]);
    expect(doc.paths["/v1/me"].get.operationId).toBe("getMe");
  });
});
```

Run: `pnpm --filter @everycent/api test` → Expected: FAIL (`/v1/me` returns 404; `routes/me` missing).

- [ ] **Step 4: Implement requireAuth, /v1/me, security scheme**

`apps/api/src/middleware/require-auth.ts`:
```ts
import { createMiddleware } from "hono/factory";
import type { AuthSession, AuthUser } from "../lib/auth";
import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

export type AuthedEnv = {
  Variables: {
    user: AuthUser;
    session: AuthSession;
  };
};

/** Rejects the request with 401 unless it carries a valid Better Auth session. */
export const requireAuth = createMiddleware<AppEnv & AuthedEnv>(async (c, next) => {
  const result = await c.var.deps.auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
});
```

`apps/api/src/routes/me/routes.ts`:
```ts
import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";

export const UserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    image: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("User");

export const getMe = createRoute({
  method: "get",
  path: "/me",
  operationId: "getMe",
  tags: ["Users"],
  summary: "The signed-in user",
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: "The current user",
      content: { "application/json": { schema: UserSchema } },
    },
    401: jsonError("Not signed in"),
  },
});
```

`apps/api/src/routes/me/handlers.ts`:
```ts
import type { RouteHandler } from "@hono/zod-openapi";
import type { AuthedEnv } from "../../middleware/require-auth";
import type { AppEnv } from "../../types";
import type { getMe } from "./routes";

export const getMeHandler: RouteHandler<typeof getMe, AppEnv & AuthedEnv> = (c) => {
  const user = c.var.user;
  return c.json(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image ?? null,
      createdAt: user.createdAt.toISOString(),
    },
    200,
  );
};
```

`apps/api/src/routes/me/index.ts`:
```ts
import { createRouter } from "../../lib/router";
import { getMeHandler } from "./handlers";
import { getMe } from "./routes";

export const meRouter = createRouter().openapi(getMe, getMeHandler);
```

(If `.openapi(getMe, getMeHandler)` rejects the handler's env type, type the router as `createRouter()` and cast nothing — instead change `createRouter` usage to `new OpenAPIHono<AppEnv & AuthedEnv>` only for this router via a generic: make `createRouter<E extends AppEnv = AppEnv>()` return `new OpenAPIHono<E>(...)` and call `createRouter<AppEnv & AuthedEnv>()` here.)

In `apps/api/src/lib/docs.ts`, at the top of `registerDocs` add:
```ts
  app.openAPIRegistry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description: "Session cookie set by the Better Auth endpoints under /api/auth",
  });
```

- [ ] **Step 5: Run to verify pass**

Run:
```bash
pnpm --filter @everycent/api test
pnpm --filter @everycent/api typecheck
```
Expected: all PASS, clean. (If Better Auth returns a different status for wrong password in this version, look up the documented status and assert that — but it must be 4xx.)

- [ ] **Step 6: Verify schema parity with the Better Auth CLI**

Run:
```bash
cd apps/api && pnpm dlx @better-auth/cli@latest generate --config src/lib/auth.ts --output /tmp/ba-schema.ts -y; cd ../..
```
The CLI needs an exported instance; if it can't load the factory, skip this step and rely on Task 3 Step 6. If it runs, diff the field names/nullability in the generated tables vs `packages/db/src/schema/auth.ts`; they must match (index/timestamp-default differences are fine).

- [ ] **Step 7: Seed script**

`apps/api/src/scripts/seed.ts`:
```ts
import { createDb } from "@everycent/db";
import { user } from "@everycent/db/schema";
import { eq } from "drizzle-orm";
import { parseEnv } from "../env";
import { createAuth } from "../lib/auth";
import { loadRootEnv } from "../load-env";

const DEMO = { email: "demo@everycent.dev", password: "everycent-demo", name: "Demo User" };

loadRootEnv();
const env = parseEnv();
const { db, close } = createDb(env.DATABASE_URL, { max: 1 });

try {
  const existing = await db.query.user.findFirst({ where: eq(user.email, DEMO.email) });
  if (existing) {
    console.log(`Demo user already exists: ${DEMO.email}`);
  } else {
    await createAuth(db, env).api.signUpEmail({ body: DEMO });
    console.log(`Created demo user ${DEMO.email} / ${DEMO.password}`);
  }
} finally {
  await close();
}
```
Add `"drizzle-orm": "catalog:"` to `apps/api/package.json` dependencies and `pnpm install`.

Run: `pnpm db:seed` twice. Expected: first "Created demo user…", second "Demo user already exists…".

- [ ] **Step 8: Commit**

```bash
pnpm format && pnpm lint
git add -A
git commit -m "feat(api): better-auth email/password, requireAuth middleware, GET /v1/me, seed

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: OpenAPI emit, drift guard, `@everycent/api-client`

**Files:**
- Create: `apps/api/src/openapi-spec.ts`, `apps/api/src/scripts/emit-openapi.ts`
- Generated: `apps/api/openapi.json`, `packages/api-client/src/schema.gen.ts`
- Create: `packages/api-client/package.json`, `packages/api-client/tsconfig.json`, `packages/api-client/src/index.ts`
- Test: `apps/api/src/openapi-spec.test.ts`, `packages/api-client/src/index.test.ts`

**Interfaces:**
- Consumes: `createApp`, `createAuth`, `parseEnv`, `buildOpenApiDocument`.
- Produces:
  - `generateOpenApiDocument()`, `serializeOpenApi(doc): string`, `OPENAPI_FILE: string`
  - `@everycent/api-client`: `createApiClient({ baseUrl, fetch? })`, `type ApiClient`, `createQueryApi(client)`, types `paths`, `components`, `operations`, `ApiError`

- [ ] **Step 1: Write failing drift test**

`apps/api/src/openapi-spec.test.ts`:
```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { generateOpenApiDocument, OPENAPI_FILE, serializeOpenApi } from "./openapi-spec";

describe("committed openapi.json", () => {
  it("matches the routes (run `pnpm generate` if this fails)", async () => {
    const committed = await readFile(OPENAPI_FILE, "utf8");
    expect(serializeOpenApi(generateOpenApiDocument())).toBe(committed);
  });

  it("documents every route with an operationId", () => {
    const doc = generateOpenApiDocument();
    for (const [path, item] of Object.entries(doc.paths ?? {})) {
      for (const [method, op] of Object.entries(item as Record<string, { operationId?: string }>)) {
        expect(op.operationId, `${method.toUpperCase()} ${path}`).toBeTruthy();
      }
    }
  });
});
```

Run: `pnpm --filter @everycent/api exec vitest run src/openapi-spec.test.ts` → Expected: FAIL (module missing).

- [ ] **Step 2: Implement spec generation + emit script**

`apps/api/src/openapi-spec.ts`:
```ts
import { fileURLToPath } from "node:url";
import { createDb } from "@everycent/db";
import { createApp } from "./app";
import { parseEnv } from "./env";
import { createAuth } from "./lib/auth";
import { buildOpenApiDocument } from "./lib/docs";

export const OPENAPI_FILE = fileURLToPath(new URL("../openapi.json", import.meta.url));

/**
 * Builds the OpenAPI document from a fully wired app without any real config or DB access
 * (postgres.js connects lazily, and building the doc never queries).
 */
export function generateOpenApiDocument() {
  const env = parseEnv({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://spec:spec@127.0.0.1:1/spec",
    BETTER_AUTH_SECRET: "openapi-spec-generation-placeholder-secret",
    BETTER_AUTH_URL: "http://localhost:3000",
    WEB_ORIGIN: "http://localhost:5173",
  });
  const { db } = createDb(env.DATABASE_URL, { max: 1 });
  return buildOpenApiDocument(createApp({ db, env, auth: createAuth(db, env) }));
}

export function serializeOpenApi(doc: unknown): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
```

`apps/api/src/scripts/emit-openapi.ts`:
```ts
import { writeFile } from "node:fs/promises";
import { generateOpenApiDocument, OPENAPI_FILE, serializeOpenApi } from "../openapi-spec";

await writeFile(OPENAPI_FILE, serializeOpenApi(generateOpenApiDocument()));
console.log(`Wrote ${OPENAPI_FILE}`);
```

Run:
```bash
pnpm --filter @everycent/api openapi:emit
pnpm --filter @everycent/api exec vitest run src/openapi-spec.test.ts
```
Expected: `apps/api/openapi.json` written containing `/v1/health`, `/v1/me`, `components.schemas.{Error,Health,User}`, `components.securitySchemes.cookieAuth`; tests PASS. The emit script must exit on its own (no hanging DB handle).

- [ ] **Step 3: Create api-client package**

`packages/api-client/package.json`:
```json
{
  "name": "@everycent/api-client",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "generate": "openapi-typescript ../../apps/api/openapi.json -o src/schema.gen.ts",
    "typecheck": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "openapi-fetch": "catalog:",
    "openapi-react-query": "catalog:"
  },
  "peerDependencies": {
    "@tanstack/react-query": "catalog:"
  },
  "devDependencies": {
    "@everycent/tsconfig": "workspace:*",
    "@tanstack/react-query": "catalog:",
    "openapi-typescript": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/api-client/tsconfig.json`:
```json
{
  "extends": "@everycent/tsconfig/base.json",
  "compilerOptions": { "lib": ["ES2023", "DOM", "DOM.Iterable"] },
  "include": ["src"]
}
```

Run:
```bash
pnpm install
pnpm --filter @everycent/api-client generate
```
Expected: `packages/api-client/src/schema.gen.ts` exists and contains `"/v1/me"` and `"/v1/health"`.

- [ ] **Step 4: Write failing client test**

`packages/api-client/src/index.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createApiClient } from "./index";

describe("createApiClient", () => {
  it("calls typed paths on the base URL with credentials included", async () => {
    const requests: Request[] = [];
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: async (input) => {
        requests.push(input as Request);
        return Response.json({ status: "ok", database: "ok" });
      },
    });

    const { data, error } = await client.GET("/v1/health");

    expect(error).toBeUndefined();
    expect(data?.status).toBe("ok");
    expect(requests[0]?.url).toBe("http://api.test/v1/health");
    expect(requests[0]?.credentials).toBe("include");
  });

  it("surfaces the API error shape on failure", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: async () =>
        Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 }),
    });
    const { data, error } = await client.GET("/v1/me");
    expect(data).toBeUndefined();
    expect(error?.error.code).toBe("UNAUTHORIZED");
  });
});
```

Run: `pnpm --filter @everycent/api-client test` → Expected: FAIL (`./index` missing).

- [ ] **Step 5: Implement client**

`packages/api-client/src/index.ts`:
```ts
import createFetchClient from "openapi-fetch";
import createReactQueryClient from "openapi-react-query";
import type { components, paths } from "./schema.gen";

export type { components, operations, paths } from "./schema.gen";

/** The standard API error body. */
export type ApiError = components["schemas"]["Error"];

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: (input: Request) => Promise<Response>;
}

export function createApiClient({ baseUrl, fetch }: ApiClientOptions) {
  return createFetchClient<paths>({ baseUrl, credentials: "include", fetch });
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** TanStack Query bindings: `$api.useQuery("get", "/v1/me")`, `$api.queryOptions(...)`. */
export function createQueryApi(client: ApiClient) {
  return createReactQueryClient(client);
}
```

- [ ] **Step 6: Verify the whole generate pipeline through Turbo**

Run:
```bash
pnpm --filter @everycent/api-client test
pnpm --filter @everycent/api-client typecheck
pnpm generate
git status --short
```
Expected: tests PASS; typecheck clean; `pnpm generate` runs `@everycent/api#openapi:emit` before `@everycent/api-client#generate`; `git status` shows no changes to generated files after re-running (deterministic output).

- [ ] **Step 7: Commit**

```bash
pnpm format && pnpm lint
git add -A
git commit -m "feat: emit openapi.json with drift guard and generate typed api-client

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: `@everycent/ui` — shadcn/ui shared package

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/components.json`, `packages/ui/src/styles/globals.css`, `packages/ui/src/lib/utils.ts`
- Generated by shadcn CLI: `packages/ui/src/components/*.tsx`, `packages/ui/src/hooks/*.ts`
- Create: `apps/web/components.json` (web app itself is completed in Task 8; this file is needed now so the CLI can route components into `packages/ui`)

**Interfaces:**
- Produces imports: `@everycent/ui/globals.css`, `@everycent/ui/lib/utils` (`cn`), `@everycent/ui/components/<name>` (button, input, label, card, sonner, dropdown-menu, separator, sidebar, skeleton, tooltip, avatar, sheet), `@everycent/ui/hooks/<name>` (use-mobile).

- [ ] **Step 1: Generate a reference shadcn Vite monorepo (scratch, not committed)**

Run (scratch dir outside the repo):
```bash
SCRATCH=$(mktemp -d)
cd "$SCRATCH" && pnpm dlx shadcn@latest init -t vite --monorepo -b radix -n ref -y
ls ref/packages/ui ref/apps/web
cat ref/packages/ui/components.json ref/apps/web/components.json ref/packages/ui/package.json
cat ref/packages/ui/src/styles/globals.css ref/packages/ui/src/lib/utils.ts
cd -
```
Expected: a working reference. If the CLI prompts for a preset, accept the default. Record the exact `style`, `baseColor`, `iconLibrary` values and the full `globals.css` — the next steps copy them, replacing `@workspace/ui` with `@everycent/ui`.

- [ ] **Step 2: Create `packages/ui`**

`packages/ui/package.json` (merge in any extra deps the reference's `packages/ui/package.json` lists, e.g. fonts):
```json
{
  "name": "@everycent/ui",
  "private": true,
  "type": "module",
  "exports": {
    "./globals.css": "./src/styles/globals.css",
    "./lib/*": "./src/lib/*.ts",
    "./components/*": "./src/components/*.tsx",
    "./hooks/*": "./src/hooks/*.ts"
  },
  "scripts": {
    "typecheck": "tsc"
  },
  "peerDependencies": {
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "catalog:",
    "next-themes": "catalog:",
    "radix-ui": "^1.6.7",
    "sonner": "catalog:",
    "tailwind-merge": "^3.7.0",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@everycent/tsconfig": "workspace:*",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "tailwindcss": "catalog:",
    "typescript": "catalog:"
  }
}
```

`packages/ui/tsconfig.json`:
```json
{
  "extends": "@everycent/tsconfig/react.json",
  "compilerOptions": { "types": [] },
  "include": ["src"]
}
```

`packages/ui/components.json` (use the reference's `style`/`baseColor`/`iconLibrary` if they differ):
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@everycent/ui/components",
    "utils": "@everycent/ui/lib/utils",
    "hooks": "@everycent/ui/hooks",
    "lib": "@everycent/ui/lib",
    "ui": "@everycent/ui/components"
  }
}
```

`packages/ui/src/lib/utils.ts`:
```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`packages/ui/src/styles/globals.css`: copy the reference file verbatim, then make sure the top of the file is:
```css
@import "tailwindcss";
@import "tw-animate-css";

@source "../../../../apps/**/*.{ts,tsx}";
@source "../**/*.{ts,tsx}";

@custom-variant dark (&:is(.dark *));
```
(Path check: from `packages/ui/src/styles/`, `../../../../apps` is the repo's `apps/` directory. Keep the reference's `@theme inline`, `:root`, `.dark` and `@layer base` blocks unchanged.)

- [ ] **Step 3: Create `apps/web/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "../../packages/ui/src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "hooks": "@/hooks",
    "lib": "@/lib",
    "utils": "@everycent/ui/lib/utils",
    "ui": "@everycent/ui/components"
  }
}
```
(`style`, `baseColor`, `iconLibrary` must equal `packages/ui/components.json`.) Also create a minimal `apps/web/package.json` now so the CLI recognises the workspace:
```json
{
  "name": "@everycent/web",
  "private": true,
  "type": "module",
  "dependencies": {
    "@everycent/ui": "workspace:*"
  }
}
```

- [ ] **Step 4: Add components through the CLI**

Run:
```bash
pnpm install
pnpm dlx shadcn@latest add button input label card sonner dropdown-menu separator sidebar skeleton tooltip avatar sheet -c apps/web -y
ls packages/ui/src/components packages/ui/src/hooks
```
Expected: component files land in `packages/ui/src/components/` and `use-mobile.ts` in `packages/ui/src/hooks/`; their internal imports use `@everycent/ui/...`. Nothing is written to `apps/web/src/components/ui`. If the CLI added dependencies to `packages/ui/package.json`, keep them; if any duplicate a catalog entry, switch that entry to `catalog:`.

- [ ] **Step 5: Verify**

Run:
```bash
pnpm install
pnpm --filter @everycent/ui typecheck
pnpm format && pnpm lint
```
Expected: typecheck clean; lint clean (components are format-only via the Biome override). If `sonner.tsx` imports `next-themes`, that's expected — the web app uses `next-themes` as its theme provider.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): shared shadcn/ui package with tailwind v4 theme

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: `@everycent/web` — TanStack Router SPA with auth + app shell

**Files:**
- Modify: `apps/web/package.json` (full version below)
- Create: `apps/web/{index.html, tsconfig.json, vite.config.ts, vitest.config.ts, tsr.config.json}`
- Create: `apps/web/src/{main.tsx, router.tsx, styles.css, vite-env.d.ts}`
- Create: `apps/web/src/lib/{api.ts, auth-client.ts, session.ts, safe-redirect.ts}`
- Create: `apps/web/src/components/{app-shell.tsx, mode-toggle.tsx, auth-card.tsx, sign-in-form.tsx, sign-up-form.tsx, not-found.tsx}`
- Create: `apps/web/src/routes/{__root.tsx, sign-in.tsx, sign-up.tsx, _authed.tsx, _authed/index.tsx}`
- Generated: `apps/web/src/routeTree.gen.ts`
- Test: `apps/web/src/lib/safe-redirect.test.ts`, `apps/web/src/components/sign-in-form.test.tsx`, `apps/web/src/test/setup.ts`

**Interfaces:**
- Consumes: `createApiClient`, `createQueryApi` (`@everycent/api-client`); `formatMoney`, `zero` (`@everycent/money`); `@everycent/ui/components/*`, `@everycent/ui/globals.css`.
- Produces: routes `/sign-in?redirect=`, `/sign-up`, `/` (authed); `safeRedirect(target: unknown): string`; `sessionQueryOptions`; `SignInForm({ onSubmit })` where `onSubmit(values: { email: string; password: string }): Promise<string | null>` (returns an error message or null).

- [ ] **Step 1: Package + config files**

`apps/web/package.json`:
```json
{
  "name": "@everycent/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "generate": "tsr generate",
    "typecheck": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@everycent/api-client": "workspace:*",
    "@everycent/money": "workspace:*",
    "@everycent/ui": "workspace:*",
    "@tanstack/react-query": "catalog:",
    "@tanstack/react-router": "catalog:",
    "better-auth": "catalog:",
    "lucide-react": "catalog:",
    "next-themes": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "sonner": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@everycent/tsconfig": "workspace:*",
    "@tailwindcss/vite": "catalog:",
    "@tanstack/react-query-devtools": "catalog:",
    "@tanstack/react-router-devtools": "catalog:",
    "@tanstack/router-cli": "catalog:",
    "@tanstack/router-plugin": "catalog:",
    "@testing-library/jest-dom": "catalog:",
    "@testing-library/react": "catalog:",
    "@testing-library/user-event": "catalog:",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "jsdom": "catalog:",
    "tailwindcss": "catalog:",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vitest": "catalog:"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "@everycent/tsconfig/react.json",
  "compilerOptions": {
    "types": ["vite/client", "node"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

`apps/web/tsr.config.json`:
```json
{
  "target": "react",
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts",
  "autoCodeSplitting": true
}
```

`apps/web/vite.config.ts`:
```ts
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  // Router plugin must come before the React plugin.
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in dev: the browser only ever talks to :5173, so auth cookies just work.
    proxy: { "/v1": apiTarget, "/api": apiTarget },
  },
});
```

`apps/web/vitest.config.ts`:
```ts
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
    },
  }),
);
```

`apps/web/src/test/setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="everycent — give every cent a job." />
    <title>everycent</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
`apps/web/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API origin. Omit in dev (same-origin via the Vite proxy). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

`apps/web/src/styles.css`:
```css
@import "@everycent/ui/globals.css";
```

Run: `pnpm install`

- [ ] **Step 2: Write failing tests for safeRedirect (Review Focus 1) and SignInForm**

`apps/web/src/lib/safe-redirect.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it("keeps same-origin paths, including search and hash", () => {
    expect(safeRedirect("/")).toBe("/");
    expect(safeRedirect("/budget?month=2026-09#top")).toBe("/budget?month=2026-09#top");
  });

  it("falls back to / for anything that could leave the site", () => {
    for (const target of [
      undefined,
      null,
      42,
      "",
      "budget",
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "/%2F%2Fevil.com",
    ]) {
      expect(safeRedirect(target), String(target)).toBe("/");
    }
  });
});
```

`apps/web/src/components/sign-in-form.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignInForm } from "./sign-in-form";

describe("SignInForm", () => {
  it("submits email and password", async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<SignInForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSubmit).toHaveBeenCalledWith({ email: "ada@example.com", password: "correct-horse" });
  });

  it("shows the error message returned by onSubmit", async () => {
    render(<SignInForm onSubmit={async () => "Invalid email or password"} />);

    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });
});
```

Run: `pnpm --filter @everycent/web test` → Expected: FAIL (modules missing).

- [ ] **Step 3: Implement lib + forms**

`apps/web/src/lib/safe-redirect.ts`:
```ts
/** Only allow same-origin absolute paths as post-login redirect targets. */
export function safeRedirect(target: unknown): string {
  if (typeof target !== "string" || !target.startsWith("/")) return "/";
  try {
    const decoded = decodeURIComponent(target);
    if (decoded.startsWith("//") || decoded.startsWith("/\\")) return "/";
  } catch {
    return "/";
  }
  const url = new URL(target, "http://same-origin.invalid");
  if (url.origin !== "http://same-origin.invalid") return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
```

`apps/web/src/lib/api.ts`:
```ts
import { createApiClient, createQueryApi } from "@everycent/api-client";

export const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? window.location.origin,
});

/** Typed TanStack Query bindings for the everycent API. */
export const $api = createQueryApi(apiClient);
```

`apps/web/src/lib/auth-client.ts`:
```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? window.location.origin,
});
```

`apps/web/src/lib/session.ts`:
```ts
import { queryOptions } from "@tanstack/react-query";
import { authClient } from "./auth-client";

export const sessionQueryOptions = queryOptions({
  queryKey: ["session"],
  queryFn: async () => {
    const { data, error } = await authClient.getSession();
    if (error) throw new Error(error.message ?? "Failed to load session");
    return data; // null when signed out
  },
  staleTime: 60_000,
});
```

`apps/web/src/components/auth-card.tsx`:
```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@everycent/ui/components/card";
import type { ReactNode } from "react";

export function AuthCard(props: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="font-semibold text-primary text-sm tracking-tight">everycent</p>
          <CardTitle className="text-2xl">{props.title}</CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
        <CardContent>{props.children}</CardContent>
        <CardFooter className="justify-center text-muted-foreground text-sm">
          {props.footer}
        </CardFooter>
      </Card>
    </main>
  );
}
```

`apps/web/src/components/sign-in-form.tsx`:
```tsx
import { Button } from "@everycent/ui/components/button";
import { Input } from "@everycent/ui/components/input";
import { Label } from "@everycent/ui/components/label";
import { type FormEvent, useState } from "react";

export interface SignInValues {
  email: string;
  password: string;
}

export function SignInForm({
  onSubmit,
}: {
  onSubmit: (values: SignInValues) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const message = await onSubmit({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    setError(message);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
```

`apps/web/src/components/sign-up-form.tsx`:
```tsx
import { Button } from "@everycent/ui/components/button";
import { Input } from "@everycent/ui/components/input";
import { Label } from "@everycent/ui/components/label";
import { type FormEvent, useState } from "react";

export interface SignUpValues {
  name: string;
  email: string;
  password: string;
}

export function SignUpForm({
  onSubmit,
}: {
  onSubmit: (values: SignUpValues) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const message = await onSubmit({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    setError(message);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" autoComplete="name" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
```

Run: `pnpm --filter @everycent/web exec vitest run src/lib src/components` → Expected: PASS (4 tests).

- [ ] **Step 4: Implement shell components**

`apps/web/src/components/mode-toggle.tsx`:
```tsx
import { Button } from "@everycent/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@everycent/ui/components/dropdown-menu";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ModeToggle() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

`apps/web/src/components/not-found.tsx`:
```tsx
import { Button } from "@everycent/ui/components/button";
import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="font-semibold text-5xl tabular-nums">404</p>
      <p className="text-muted-foreground">This page doesn't exist.</p>
      <Button asChild variant="outline">
        <Link to="/">Back to budget</Link>
      </Button>
    </main>
  );
}
```

`apps/web/src/components/app-shell.tsx`:
```tsx
import { Avatar, AvatarFallback } from "@everycent/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@everycent/ui/components/dropdown-menu";
import { Separator } from "@everycent/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@everycent/ui/components/sidebar";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, LogOut, Wallet } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { ModeToggle } from "./mode-toggle";

export function AppShell({ user }: { user: { name: string; email: string } }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/sign-in" });
  }

  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Link to="/" className="px-2 py-1.5 font-semibold text-lg tracking-tight">
            everycent
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/" activeProps={{ "data-active": true }}>
                    <Wallet />
                    <span>Budget</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-muted-foreground text-xs">{user.email}</span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 5: Implement routes, router, entry**

`apps/web/src/routes/__root.tsx`:
```tsx
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { NotFound } from "@/components/not-found";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  return (
    <>
      <Outlet />
      {import.meta.env.DEV && (
        <>
          <TanStackRouterDevtools position="bottom-right" />
          <ReactQueryDevtools buttonPosition="bottom-left" />
        </>
      )}
    </>
  );
}
```

`apps/web/src/routes/_authed.tsx`:
```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { sessionQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (!session) {
      throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    }
    return { session };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { session } = Route.useRouteContext();
  return <AppShell user={session.user} />;
}
```

`apps/web/src/routes/_authed/index.tsx`:
```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@everycent/ui/components/card";
import { Skeleton } from "@everycent/ui/components/skeleton";
import { formatMoney, zero } from "@everycent/money";
import { createFileRoute } from "@tanstack/react-router";
import { $api } from "@/lib/api";

export const Route = createFileRoute("/_authed/")({
  component: BudgetPage,
});

function BudgetPage() {
  const me = $api.useQuery("get", "/v1/me");

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Budget</h1>
        <p className="text-muted-foreground">
          {me.isPending ? (
            <Skeleton className="mt-1 h-5 w-48" />
          ) : me.isError ? (
            "Couldn't load your profile."
          ) : (
            `Welcome, ${me.data.name}.`
          )}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardDescription>Ready to Assign</CardDescription>
          <CardTitle className="text-4xl tabular-nums">{formatMoney(zero("USD"))}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Every cent needs a job. Accounts and categories are coming next.
        </CardContent>
      </Card>
    </div>
  );
}
```
(The `<Skeleton>` renders a `div`; if React warns about `div` inside `p`, change the wrapping `<p>` to a `<div>`.)

`apps/web/src/routes/sign-in.tsx`:
```tsx
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AuthCard } from "@/components/auth-card";
import { SignInForm } from "@/components/sign-in-form";
import { authClient } from "@/lib/auth-client";
import { safeRedirect } from "@/lib/safe-redirect";
import { sessionQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/sign-in")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (session) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: SignInPage,
});

function SignInPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your budget."
      footer={
        <span>
          New here?{" "}
          <Link to="/sign-up" className="text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </span>
      }
    >
      <SignInForm
        onSubmit={async (values) => {
          const { error } = await authClient.signIn.email(values);
          if (error) return error.message ?? "Sign in failed";
          await queryClient.invalidateQueries({ queryKey: sessionQueryOptions.queryKey });
          await navigate({ href: safeRedirect(search.redirect) });
          return null;
        }}
      />
    </AuthCard>
  );
}
```

`apps/web/src/routes/sign-up.tsx`:
```tsx
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AuthCard } from "@/components/auth-card";
import { SignUpForm } from "@/components/sign-up-form";
import { authClient } from "@/lib/auth-client";
import { sessionQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/sign-up")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (session) throw redirect({ to: "/" });
  },
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <AuthCard
      title="Create your account"
      description="Give every cent a job."
      footer={
        <span>
          Already have an account?{" "}
          <Link to="/sign-in" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </span>
      }
    >
      <SignUpForm
        onSubmit={async (values) => {
          const { error } = await authClient.signUp.email(values);
          if (error) return error.message ?? "Sign up failed";
          await queryClient.invalidateQueries({ queryKey: sessionQueryOptions.queryKey });
          await navigate({ to: "/" });
          return null;
        }}
      />
    </AuthCard>
  );
}
```

`apps/web/src/router.tsx`:
```tsx
import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { NotFound } from "./components/not-found";
import { routeTree } from "./routeTree.gen";

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    // Let TanStack Query own caching; the router always asks it.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
```

`apps/web/src/main.tsx`:
```tsx
import { Toaster } from "@everycent/ui/components/sonner";
import { TooltipProvider } from "@everycent/ui/components/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAppRouter } from "./router";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
const router = createAppRouter(queryClient);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element missing from index.html");

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
      <Toaster />
    </ThemeProvider>
  </StrictMode>,
);
```

- [ ] **Step 6: Generate route tree, run checks**

Run:
```bash
pnpm --filter @everycent/web generate
pnpm --filter @everycent/web typecheck
pnpm --filter @everycent/web test
pnpm --filter @everycent/web build
pnpm format && pnpm lint
```
Expected: `src/routeTree.gen.ts` created; typecheck clean; tests PASS; `apps/web/dist` built with no errors. Fix any API mismatch against installed versions (e.g. `redirect({ href })`, `validateSearch` with Zod 4 Standard Schema) per the Global Constraints rule.

- [ ] **Step 7: End-to-end check in the browser**

Start `pnpm dev` (run_in_background). Using the built-in browser (Claude_Browser tools):
1. Open `http://localhost:5173/` → expect redirect to `/sign-in?redirect=%2F`.
2. Click "Create an account"; sign up with a new generated test email + password → expect the app shell with "Welcome, <name>." and "Ready to Assign $0.00".
3. Toggle theme to Dark → page turns dark.
4. Sign out from the user menu → back on `/sign-in`.
5. Sign in again → back on `/`.
6. Open `http://localhost:5173/sign-in?redirect=//evil.com` while signed in → lands on `/`.
7. Open `http://localhost:3000/docs` → Scalar shows `getHealth` and `getMe`.
8. `read_console_messages` with `onlyErrors: true` → no errors.
Stop the dev servers.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(web): tanstack router spa with better-auth sign-in/up and app shell

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Documentation + full-gate verification

**Files:**
- Create: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: onboarding docs and a verified green `pnpm check` from a clean state.

- [ ] **Step 1: Write `README.md`**

```markdown
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

Requirements: Node ≥ 24, pnpm (auto-selected via `packageManager`), Docker.

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
```

- [ ] **Step 2: Write `CLAUDE.md` (conventions for future agents)**

```markdown
# everycent — agent guide

Read `README.md` first. Design: `docs/superpowers/specs/2026-09-28-monorepo-foundation-design.md`.

## Invariants (never break)

- **Money is never a float.** Use `@everycent/money`: `bigint` minor units + `CurrencyCode`.
  DB: `bigint` column (mode "bigint") + adjacent `currency char(3)`. JSON: integer string
  (`zMoney`/`zMinorUnits`). Never `Number(amount)`, never `parseFloat`.
- Currency exponents in `packages/money/src/currency.ts` must never change for an existing code.
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

## Before claiming done

`pnpm check` must pass.
```

- [ ] **Step 3: Full clean verification**

Run:
```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules .turbo apps/*/.turbo packages/*/.turbo apps/*/dist
pnpm install
pnpm db:up && pnpm db:migrate
pnpm check
git status --short
```
Expected: `pnpm check` succeeds — Biome clean, all packages typecheck, all tests pass (money, db, api, api-client, web), api + web build. `git status` shows only `README.md`/`CLAUDE.md` (no generated-file drift).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: readme and agent conventions

Co-Authored-By: Claude <noreply@anthropic.com>"
```
