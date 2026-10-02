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
| Engine (`packages/engine`) | Money: exact bigint minor-unit arithmetic, ISO 4217, FX |
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

## Roadmap

Goal: full YNAB feature parity, plus first-class multi-currency, extensive reports and opt-in AI.
Phases are ordered by dependency — build top to bottom. Tick items off as they land.
Items marked **(extra)** go beyond what YNAB offers.

### 0. Foundation

- [x] Monorepo, tooling, CI-style `pnpm check`
- [x] `@everycent/engine`: bigint minor units, ISO 4217 exponents, parse/format, allocation, rounding, FX primitives
- [x] API skeleton: `createRouter()`, `AppError`, OpenAPI + Scalar docs, generated typed client
- [x] PostgreSQL + Drizzle, UUIDv7 ids, migrations, test DB harness
- [x] Better Auth email/password sign-up, sign-in, sign-out; `/v1/me`
- [x] Web SPA shell: TanStack Router, auth-guarded routes, light/dark theme, shared shadcn UI

### 1. Account & security basics

- [ ] Email verification
- [ ] Forgot / reset password
- [ ] Change email and password
- [ ] Active sessions list and revoke
- [ ] Two-factor auth (TOTP + recovery codes)
- [ ] OAuth sign-in (Google, Apple) **(extra over email-only)**
- [ ] Delete account (with full data purge)
- [ ] User preferences: locale, date format, number format, first day of week

### 2. Budgets (plans)

- [x] Create / rename / delete a budget
- [x] Multiple budgets per user, budget switcher, last-used budget remembered
- [x] Budget base currency + currency display settings (symbol position, separators)
- [x] Budget date format and number format settings
- [x] Shared-budget foundation: `budget_member` roles (owner, editor) on the Better Auth
      organization plugin, ready for phase 16

Moved to the phases that unblock them: the default category template (phase 4), and onboarding
and fresh start (after phase 5 core).

### 3. Accounts

- [x] Budget account types: cash, checking, savings
- [x] Credit accounts: credit card, line of credit
- [x] Loan accounts: mortgage, auto loan, student loan, personal loan, medical debt, other debt
      (interest rate, minimum payment, escrow — stored; used by the phase 7 loan features)
- [x] Tracking (off-budget) accounts: asset, liability
- [x] Starting balance transaction on creation
- [x] Per-account currency — stored; only the budget currency is accepted until phase 11
- [x] Balances: cleared, uncleared, working
- [x] Account notes / nickname
- [x] Reorder accounts, sidebar grouped by type with group totals
- [x] Close / reopen accounts (YNAB-style: a non-zero balance is zeroed with a Manual Balance
      Adjustment; closed accounts move to a "Closed" section)
- [x] Delete accounts (YNAB rule: only with no history beyond the starting balance; otherwise close)

### 4. Categories

- [x] Category groups: create, rename, reorder, hide, delete
- [x] Categories: create, rename, reorder (drag and drop), move between groups, hide/unhide, delete
- [x] Reassign a deleted category's history to another category (transactions now; assigned
      amounts join in phase 6)
- [x] Category notes
- [x] Internal categories: Inflow: Ready to Assign, Uncategorized
- [x] Auto-created credit card payment categories (one per credit account)
- [x] Hidden categories section
- [ ] Category emoji / icons **(extra)**
- [x] Default category template on budget creation (YNAB-style starter groups) — moved from phase 2

### 5. Transactions & register

- [x] Account register: date, payee, category, memo, outflow, inflow, cleared
- [x] All-accounts register view
- [x] Add / edit / delete transactions inline (keyboard-first entry: Tab, Enter saves, Esc
      cancels; the full shortcut set is in phase "Keyboard shortcuts")
- [x] Math in amount fields (`230+30`, `12.50*3`), exact and rounded once
- [x] Payees: create on the fly, autocomplete, remember last category per payee
- [x] Cleared / uncleared / reconciled states, toggle cleared
- [x] Transfers between accounts (linked pair, transfer payees, on-/off-budget rules)
- [x] Split transactions (multiple categories; split transfers)
- [x] Flags (colors) with custom flag names
- [x] Running balance column
- [x] Sort, search and filter (date range, payee, category, memo, amount, flag, cleared)
- [x] Server-side paging of the register (keyset cursors; balances over the whole account)
- [ ] Multi-select + bulk edit: selection, select all matching, total, cleared, flag and categorize
      done; memo, move to account and delete still to come (see docs/verify.md)
- [ ] Approve / reject imported transactions (unapproved state)
- [x] Future-dated transactions (excluded from balances until the date)
- [ ] Tags on transactions **(extra)**
- [ ] Receipt / file attachments **(extra)**

#### Budget onboarding (moved from phase 2; needs phases 3–5 core)

- [x] Onboarding flow for a new budget (pick categories, add first account)
- [x] Fresh start (archive the old budget, start a new one with the same categories, accounts and
      partners)

### 6. Budget screen (the core loop)

- [x] Month view: Assigned, Activity, Available per category, group subtotals
- [x] Ready to Assign calculation (inflows − assigned, across months)
- [x] Assign money to categories; math in the amount field (`+`, `-`, `*`, `/`)
- [x] Available rolls over month to month
- [x] Cash overspending (reduces next month's Ready to Assign) — highlighted red
- [x] Move money between categories (and back to Ready to Assign), with Recent Moves
- [x] Cover overspending flow
- [x] Over-assigned warning (Ready to Assign negative)
- [x] Month navigation, budgeting in future months, "assigned in future" indicator
- [x] Income for future months (assign next month's income): today's YNAB has no separate
      next-month income; money is assigned in future months instead
- [ ] Auto-assign / quick budget: underfunded, assigned last month, spent last month,
      average assigned, average spent, reset available, reset assigned
- [ ] Category inspector: balance breakdown (cash left over, assigned, activity), target, notes
- [ ] Category activity drill-down (transactions for category + month)
- [ ] Collapse/expand groups, filters (underfunded, overspent, money available, snoozed)
      (collapse done in 6a)
- [ ] Undo / redo for budget and transaction edits

### 7. Credit cards & debt

- [ ] Spending on a credit card moves funds into its payment category automatically
- [ ] Credit overspending (becomes new debt, shown yellow)
- [ ] Payment category shows amount available to pay the card
- [ ] Existing credit card debt handling (starting negative balance, paying down debt)
- [ ] Credit card payment transfers reduce the payment category
- [ ] Credit card returns / refunds
- [ ] Loan accounts: principal vs interest split, escrow, extra payments
- [ ] Loan planner: payoff date, interest saved with extra payments

### 8. Targets (goals)

- [ ] Needed for spending — weekly (by day), monthly (by date), yearly, custom
      (every N months/years), by a specific date; refill vs set aside another
- [ ] Savings balance (target balance, optionally by date)
- [ ] Monthly savings builder
- [ ] Debt payment targets (for loans / credit cards; include interest)
- [ ] Target progress bars and status (funded, underfunded, overspent, on track)
- [ ] Underfunded total + "Assign underfunded" button
- [ ] Snooze a target for a month
- [ ] Repeat on/off, target history across months
- [ ] Targets overview (total needed this month vs next month)

### 9. Reconciliation

- [ ] Reconcile flow: confirm cleared balance or enter bank balance
- [ ] Automatic balance adjustment transaction
- [ ] Lock reconciled transactions (warn before editing)
- [ ] Last reconciled date per account

### 10. Scheduled transactions

- [ ] Repeat frequencies: once, daily, weekly, every other week, twice a month, every 4 weeks,
      monthly, every other month, every 3/4 months, twice a year, yearly, every other year
- [ ] Upcoming transactions list in register, enter now / skip / edit
- [ ] Auto-entry on the due date (background job)
- [ ] Scheduled splits and transfers
- [ ] Bills calendar view **(extra)**
- [ ] Upcoming bill reminders (email / push) **(extra)**

### 11. Multi-currency **(extra)**

- [ ] Accounts in any currency; register shows native amounts
- [ ] Budget in the base currency; foreign-account activity converted into category activity
- [ ] FX rate source (daily rates provider) + manual rate overrides
- [ ] Per-transaction rate lock (store original amount, currency and applied rate)
- [ ] Cross-currency transfers (two amounts, implied rate, fee)
- [ ] Unrealized FX gain/loss on foreign balances; revaluation adjustments
- [ ] Net worth and account totals in base currency and/or any display currency
- [ ] Categories/targets with a native currency (e.g. a holiday fund in EUR)
- [ ] Currency-aware reports and CSV export

### 12. Payees & rules

- [ ] Payee management: rename, combine/merge, delete, hide
- [ ] Payee default category / auto-categorization
- [ ] Renaming rules for imported payees (starts with / contains / is)
- [ ] Payee location (lat/long) for mobile suggestions
- [ ] Advanced rules engine: match on payee/amount/account/memo → set category, flag, tags, memo **(extra)**

### 13. File import & export

- [ ] Import CSV (column mapping, date/amount format detection), OFX, QFX, QIF
- [ ] Duplicate detection and match-to-existing (import ID + fuzzy date/amount)
- [ ] Imported transactions land as unapproved, with suggested category from payee
- [ ] Import from YNAB (API token or exported budget) **(extra)**
- [ ] Export budget + registers to CSV
- [ ] Full data export (JSON) and re-import / backup

### 14. Bank sync (direct import)

- [ ] Provider abstraction (e.g. Plaid, GoCardless/Nordigen, SimpleFIN)
- [ ] Link account, pick accounts, choose start date
- [ ] Background sync + manual "import now"
- [ ] Matching against manually entered / scheduled transactions
- [ ] Balance mismatch warnings; reconnect flow for expired connections
- [ ] Unlink / relink

### 15. Reports

YNAB parity:

- [ ] Spending breakdown (by category group / category / payee, donut + table)
- [ ] Spending trends (over time, by category/payee)
- [ ] Net worth (assets vs debts over time)
- [ ] Income vs expense (monthly table)
- [ ] Age of Money
- [ ] Report filters: date range, accounts, categories, payees
- [ ] Budget-screen reflection stats (month summary: assigned, spent, avg, cost to be me)

Extras:

- [ ] Budget vs actual (per category, per month, variance)
- [ ] Cash-flow forecast using scheduled transactions + targets
- [ ] Category history (assigned / activity / available over time)
- [ ] Payee report (top payees, frequency, average spend)
- [ ] Tag report
- [ ] Savings rate and income breakdown
- [ ] Debt payoff progress / projected debt-free date
- [ ] Currency exposure report (balances by currency, FX impact)
- [ ] Year in review
- [ ] Custom saved reports, dashboard of pinned report widgets
- [ ] Export reports to CSV / PDF

### 16. Sharing (YNAB Together)

- [ ] Invite members to a budget by email (up to N members)
- [ ] Roles: owner, editor, viewer **(extra over YNAB's single role)**
- [ ] Per-member activity attribution ("entered by")
- [ ] Leave budget / remove member / transfer ownership
- [ ] Real-time updates across clients (WebSocket / SSE) **(extra)**

### 17. UX polish

- [ ] Keyboard shortcuts across budget and register (with a cheat-sheet)
- [ ] Command palette **(extra)**
- [ ] Responsive layout for phones and tablets
- [ ] Installable PWA with offline entry queue and sync
- [ ] Accessibility pass (screen readers, focus order, contrast)
- [ ] Internationalization (UI translations)
- [ ] Hide amounts / privacy mode **(extra)**
- [ ] In-app notifications center (overspending, sync issues, upcoming bills)

### 18. AI assistant (opt-in) **(extra)**

Off by default, per-user toggle, clear data-usage notice, no data sent unless enabled.

- [ ] Opt-in settings + provider/model configuration, usage limits, audit log of AI calls
- [ ] Auto-categorization suggestions for new / imported transactions (learns from history)
- [ ] Payee cleanup (normalize messy bank payee strings)
- [ ] Natural-language transaction entry ("coffee 4.50 yesterday on Visa")
- [ ] Receipt scanning (photo → amount, payee, date, splits)
- [ ] Chat with your budget ("how much did I spend on dining in Q2?") with cited transactions
- [ ] Budget assignment suggestions based on targets and history
- [ ] Anomaly / subscription detection (price hikes, duplicate charges, forgotten subscriptions)
- [ ] Monthly narrative summary of spending and progress
- [ ] Forecasting ("will I hit my vacation target by June?")

### 19. Platform & ops

- [ ] Public REST API with personal access tokens (YNAB API parity) + rate limits
- [ ] Webhooks for transaction / budget changes **(extra)**
- [ ] Audit log / change history per budget
- [ ] Automated backups and point-in-time restore
- [ ] Observability: structured logs, metrics, error tracking
- [ ] Deployment: Docker images, production config, migrations on deploy
- [ ] Native mobile apps (or Capacitor wrapper around the PWA)
- [ ] Billing / subscriptions (if hosted as a service)
