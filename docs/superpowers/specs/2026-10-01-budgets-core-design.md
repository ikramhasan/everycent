# everycent — Budgets Core Design

- **Date:** 2026-10-01
- **Status:** Approved in conversation, pending written-spec review
- **Scope:** Sub-project 01 of the Phase 2 build sequence. Create, rename and delete budgets;
  multiple budgets per user with a switcher and a remembered last-used budget; per-budget currency,
  number and date format settings. Budget-scoped access control that later phases and partner
  sharing build on.

## 1. Context & intent

Roadmap Phase 2 ("Budgets") contains three items that need tables from later phases (category
template, onboarding, fresh start). Dependent work is never mocked, so Phase 2 was split into
sub-projects built in dependency order:

| # | Sub-project | Status |
|---|---|---|
| 00 | Rename `@everycent/money` → `@everycent/engine` | Done (`74552d1`) |
| 01 | **Budgets core** (this spec) | Designing |
| 02 | Categories (Phase 4 core) + starter template on budget creation | Queued |
| 03 | Accounts (Phase 3) + starting balances, minimal transactions/payees tables | Queued |
| 04 | Onboarding + fresh start | Queued |

Every later domain table hangs off `budget_id`, so this sub-project is the root of the graph.

**Product intent.** Match YNAB as closely as possible. Partners managing a budget together is a
core goal: sharing UI arrives in Phase 16, but the data model and access checks must support it
from day one so Phase 16 needs no data migration or access-check rewrite.

**Success:** a user can create several budgets with their own currency and formats, switch between
them from the sidebar, land on the last-used one on any device, rename and reformat them, and
delete them as owner. Every budget-scoped API route authorizes through one membership helper, and
`pnpm check` passes.

### Decisions made (with the user)

| Topic | Decision |
|---|---|
| Membership model | `budget_member(budget_id, user_id, role)` from day one; never an `owner_id` column |
| Library | Better Auth **organization plugin** underneath (tables, roles, membership, invitations, hooks) |
| API surface | Our own `/v1/budgets…` routes (`createRouter()`, zod, OpenAPI, typed client) call `auth.api.*` server-side. The web app never calls the plugin directly |
| Plugin HTTP endpoints | Not exposed: `/api/auth/organization/*` returns 404 |
| Admin plugin | Not used: its roles are global per user. Candidate for Phase 19 support tooling |
| Roles | YNAB Together: `owner` (creator) and `editor` (shared access). No viewer yet; the roadmap's viewer is a Phase 16 extra |
| Format settings | Explicit YNAB-style presets (number format, symbol position, date format), not a locale |
| Base currency | Chosen at creation, immutable afterwards |
| Current budget | Carried in the URL (`/budgets/:budgetId/…`), not in session state |
| Last-used budget | Stored per user on the server (works across devices); recorded when a budget is fetched |
| UI wording | "Budget" (YNAB now says "Plan"; we keep "Budget") |

## 2. Data model

All tables live in `packages/db/src/schema/budget.ts`; ids are `newId()`; columns snake_case via
the shared casing setting; migration via `pnpm db:generate`. Plugin tables are renamed through
the plugin's `schema.*.modelName` / `fields` options so the database never says "organization".

### `budget` (plugin organization table)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `newId()` |
| `name` | text not null | 1–100 chars after trim; not unique |
| `slug` | text not null unique | Required by the plugin. Set to a fresh `newId()`; never shown or used |
| `logo` | text null | Plugin field, unused |
| `metadata` | text null | Plugin field, unused |
| `currency` | char(3) not null | ISO 4217, immutable after creation |
| `number_format` | text not null | One of the number format keys below |
| `currency_symbol_position` | text not null | `before` · `after` · `none` |
| `date_format` | text not null | One of the date format keys below |
| `created_at`, `updated_at` | timestamptz | `updated_at` via `$onUpdate` |

The four settings columns are registered as plugin `additionalFields` so `auth.api` create/update
calls accept them. Validation happens in our zod schemas.

### `budget_member` (plugin member table)

`id`, `budget_id → budget` (on delete cascade), `user_id → user` (on delete cascade), `role`,
`created_at`. Unique index on `(budget_id, user_id)`; index on `user_id`.

### `budget_invitation` (plugin invitation table)

The plugin's invitation columns (`budget_id` FK cascade, `email`, `role`, `status`, `expires_at`,
`inviter_id → user`, `created_at`). Exists because the plugin requires it; unused until Phase 16.

### `session.active_organization_id`

The plugin adds this column to `session`. Present in the schema, unused by our code.

### `user_preference` (ours)

| Column | Type | Notes |
|---|---|---|
| `user_id` | text PK → `user` (cascade) | |
| `last_budget_id` | text null → `budget` (on delete set null) | |
| `created_at`, `updated_at` | timestamptz | |

Phase 1's user preferences (locale, formats, first day of week) will add columns here.

### Setting values

Defined once in `@everycent/engine` as `as const` arrays with zod enums (§5) and used by the API,
the web app and the Drizzle column types.

| Number format key | Example | Group | Decimal |
|---|---|---|---|
| `comma_dot` | `1,234,567.89` | `,` | `.` |
| `dot_comma` | `1.234.567,89` | `.` | `,` |
| `space_comma` | `1 234 567,89` | NBSP | `,` |
| `space_dot` | `1 234 567.89` | NBSP | `.` |
| `apostrophe_dot` | `1'234'567.89` | `'` | `.` |
| `indian` | `12,34,567.89` | `,` (3 then 2-digit groups) | `.` |

Decimal places always come from the currency's exponent: cents are never hidden, and JPY shows none.

| Date format key | Example (1 Oct 2026) |
|---|---|
| `MM/DD/YYYY` | `10/01/2026` |
| `DD/MM/YYYY` | `01/10/2026` |
| `YYYY-MM-DD` | `2026-10-01` |
| `DD.MM.YYYY` | `01.10.2026` |
| `YYYY/MM/DD` | `2026/10/01` |
| `DD-MM-YYYY` | `01-10-2026` |

## 3. Roles & permissions

Defined with the plugin's `createAccessControl` in `apps/api/src/lib/budget-access-control.ts`,
replacing the plugin's default `owner/admin/member` roles. `creatorRole` is `owner`.

| Action | owner | editor |
|---|---|---|
| Read the budget and (later) its data | ✓ | ✓ |
| Edit budget data (later phases) | ✓ | ✓ |
| Rename, change formats (`budget: update`) | ✓ | ✓ |
| Delete the budget (`budget: delete`) | ✓ | – |
| Invite/remove members, transfer ownership (Phase 16) | ✓ | – |
| Fresh start (sub-project 04) | ✓ | – |

This matches YNAB Together: shared members "do everything within the plan except manage sharing
with other members, delete the plan, or Fresh Start the plan"; there are no read-only members.
Statements are organized by resource so later phases add resources (e.g.
`transaction: ["create", "update", "delete"]`) rather than roles.

## 4. API

All routes: `createRouter()`, `operationId`, response schema, `jsonError` responses,
`middleware: [requireAuth] as const`, `security: [{ cookieAuth: [] }]`, tag `Budgets`.
Mutations go through `auth.api.*` (passing the request headers) so plugin rules and hooks run;
reads query Drizzle directly.

### Response schema `Budget`

`{ id, name, currency, numberFormat, currencySymbolPosition, dateFormat, role, createdAt, updatedAt }`
where `role` is the caller's role on that budget and timestamps are ISO strings.

### Routes

| Method & path | operationId | Behavior | Errors |
|---|---|---|---|
| `GET /v1/budgets` | `listBudgets` | `{ budgets: Budget[], lastUsedBudgetId: string \| null }`, budgets sorted by name (case-insensitive). `lastUsedBudgetId` is null unless the caller is still a member of it | 401 |
| `POST /v1/budgets` | `createBudget` | Body `{ name, currency, numberFormat, currencySymbolPosition, dateFormat }`. Caller becomes `owner`; budget becomes their last-used. 201 `Budget` | 400, 401 |
| `GET /v1/budgets/{budgetId}` | `getBudget` | 200 `Budget`; records it as the caller's last-used budget | 401, 404 |
| `PATCH /v1/budgets/{budgetId}` | `updateBudget` | Body: any of `name`, `numberFormat`, `currencySymbolPosition`, `dateFormat` (strict object: `currency` or unknown keys → 400). 200 `Budget` | 400, 401, 403, 404 |
| `DELETE /v1/budgets/{budgetId}` | `deleteBudget` | Deletes the budget; members, invitations and (later) all budget data cascade. 204 | 401, 403, 404 |

### Access helper

`loadBudgetAccess(c, budgetId, permission?)` in `apps/api/src/lib/budget-access.ts`:

- Loads the budget joined with the caller's `budget_member` row.
- Not a member (or no such budget) → `AppError(404, "NOT_FOUND", "Budget not found")`. Never 403,
  so budget ids can't be probed.
- Member lacking `permission` → `AppError(403, "FORBIDDEN", …)`.
- Returns `{ budget, member }`. Every later budget-scoped route uses it.

### Error mapping

Better Auth `APIError`s thrown by `auth.api.*` are translated into `AppError` with the same status
and a stable code, so plugin failures render as `{ error: { code, message } }`.

### Blocking the plugin's HTTP endpoints

`app.ts` routes `/api/auth/*` straight to Better Auth. A handler registered before it returns our
standard 404 for `/api/auth/organization/*`, so clients can't create budgets, change settings or
send invitations without our validation. Server-side `auth.api.*` calls are unaffected.

### Last-used budget

Upserted into `user_preference` on `createBudget` and `getBudget`. Cleared automatically by the
`on delete set null` FK when the budget is deleted.

## 5. Engine formatting (`@everycent/engine`)

New module `packages/engine/src/format-settings.ts` (+ tests), exported from the package root:

- **Constants + zod enums:** `NUMBER_FORMATS`, `CURRENCY_SYMBOL_POSITIONS`, `DATE_FORMATS`,
  `zNumberFormat`, `zCurrencySymbolPosition`, `zDateFormat`, and a `BudgetFormatSettings` type
  `{ numberFormat, currencySymbolPosition, dateFormat }`.
- **`formatAmount(money, settings)`:** exact string operations on `toDecimalString`, never a
  float. Applies group and decimal separators (including Indian grouping) and the symbol:
  `before` → `-$1,234.56`, `after` → `-1.234,56 €` (NBSP before the symbol), `none` → `-1,234.56`.
  The symbol is Intl's `narrowSymbol` for the currency. That is display-only, unlike exponents.
- **`parseAmount(input, currency, numberFormat)`:** accepts the format's decimal separator and
  ignores its group separator, then delegates to `parseMoney`. Still rejects excess decimal places
  instead of rounding.
- **`formatDate(isoDate, dateFormat)`:** `isoDate` is a `YYYY-MM-DD` calendar date string; pure
  string reordering, no timezone math.
- **`suggestFormatSettings(locale)`:** defaults for a new budget from a BCP 47 locale. Currency
  comes from a small region map (US→USD, GB→GBP, eurozone→EUR, IN→INR, BD→BDT, JP→JPY, …; fallback
  USD). Number and date format are the closest preset to the locale's Intl output. Symbol position
  follows the locale's currency pattern.

## 6. Web app

### Routes (`apps/web/src/routes/_authed/…`)

| Route | Content |
|---|---|
| `/` | `beforeLoad` fetches `listBudgets`, then redirects to `lastUsedBudgetId`, else the first budget, else `/budgets/new` |
| `/budgets` | All budgets: name, currency, role, created date; "New budget" button |
| `/budgets/new` | Create form: name; searchable currency picker (code + `Intl.DisplayNames` name); number format, symbol position and date format selects; live preview (`-$1,234.56 · 10/01/2026`). Defaults from `suggestFormatSettings(navigator.language)`. On success, navigate to the new budget |
| `/budgets/$budgetId` | Layout: loads `getBudget`; renders the not-found component on 404; provides `useBudget()` → `{ budget, formatAmount, formatDate }` bound to the budget's settings |
| `/budgets/$budgetId/` | The current placeholder budget page, moved here; Ready to Assign shown with the budget's currency and format |
| `/budgets/$budgetId/settings` | Rename and change formats (with preview); currency shown read-only with "Currency can't be changed after creation". Owners see "Delete budget" behind an `AlertDialog` naming the budget |

### Shell

- **Budget switcher** in `SidebarHeader`, replacing the logo link: the current budget name and
  currency. The dropdown lists the other budgets, then "New budget" and "View all budgets". Outside a
  budget route it shows "Select a budget".
- Sidebar nav links (Budget, Settings) point into the current budget.
- After create/update/delete, invalidate the `listBudgets` query (and `getBudget` for that id).
  After delete, navigate to `/`, whose redirect picks the next budget.

### New UI components

`select`, `popover`, `command`, `alert-dialog` via `pnpm dlx shadcn@latest add <name> -c apps/web`,
applying the CLAUDE.md shadcn fix-ups.

## 7. Testing

- **Engine (unit):** for every number format, format and parse round-trips including negatives,
  zero, JPY (exponent 0), KWD (exponent 3) and Indian grouping; `parseAmount` rejects excess
  decimals; every date format; `suggestFormatSettings` for `en-US`, `en-GB`, `de-DE`, `fr-FR`,
  `de-CH`, `en-IN`, `bn-BD`, `ja-JP` and an unknown region.
- **API (real test DB via `createTestApp()` + `resetDatabase()`):**
  - Create → list → get → patch → delete happy path; creator's role is `owner`.
  - 400s: unknown currency, bad enum values, empty name, `currency` in a PATCH.
  - A non-member gets 404 on get, patch and delete.
  - An editor (row inserted directly into `budget_member`) can get and patch, but gets 403 on delete.
  - `lastUsedBudgetId` is set by create and get, and is null after the budget is deleted.
  - Deleting a budget removes its `budget_member` rows.
  - `/api/auth/organization/create` returns 404.
  - OpenAPI: each route has its operationId and `cookieAuth` security.
- **Web (component):** the create form shows suggested defaults and updates its preview; the
  switcher lists budgets and links to "New budget".
- `pnpm generate` artifacts committed; `pnpm check` passes.

## 8. Docs

- README roadmap: tick the four Phase 2 items delivered here. Move "Default category template" to
  Phase 4, and "Onboarding flow" and "Fresh start" to after Phase 5 core, each annotated with the
  sub-project that delivers it.
- CLAUDE.md: add the invariants "budget-scoped routes authorize via `loadBudgetAccess`" and
  "the finance accounts table must not be named `account` (Better Auth owns it)".

## 9. Out of scope

Invitations and member management UI (Phase 16), viewer role (Phase 16 extra), fresh start and
archiving (sub-project 04), category template (sub-project 02), user-level preferences (Phase 1),
admin plugin (Phase 19).
