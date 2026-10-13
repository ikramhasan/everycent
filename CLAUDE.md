# everycent — agent guide

Read `README.md` first, then `docs/plane.md` (how work is tracked in Plane: no deferring what you
can settle, test what you build, a ticket for anything you can't, keep cycles and tickets current,
single-line HTML), then `docs/deferred.md` (known gaps and work deliberately left for later
phases — check it before starting a phase, and add to it whenever you defer something), then
`docs/verify.md` (open questions about how YNAB behaves).

## Matching YNAB: confirm, don't assume

everycent follows YNAB's behaviour, one to one: feature parity comes first, our own ideas later.
Only build YNAB behaviour you've **confirmed** — from YNAB's help center (support.ynab.com), its
API docs, the user, or the real YNAB app.

**Check the real app.** Whenever you're unsure how something should work or how YNAB does it,
open YNAB's web app (app.ynab.com) in the user's Chrome and try it. Use whichever tool connects
to that browser in your harness:

- **Claude Code:** the Chrome browser tool, claude-in-chrome.
- **Other harnesses:** the Chrome MCP server configured there.

The user is signed in there with a test account made for this, so you can add test accounts and
transactions and run the actions you're checking. Look before asking the user, and note what you
found (in `docs/verify.md`, or in the commit/plan you're working on). The same browser is how you
check your own UI changes in the running app.

**Use the YNAB API to set up and read cases.** Clicking through YNAB's UI to build test data is
slow (payee/category autocomplete, cell-by-cell editing). The test account has a personal access
token in `.env` as `YNAB_TOKEN` (gitignored; never print or commit it). With it you can create
accounts and transactions and read the numbers YNAB computes in seconds:

```sh
set -a; . ./.env; set +a
A=https://api.ynab.com/v1/budgets/6fd24aaa-939f-4f59-b0bf-9fc527df1323   # "ihni7's Plan"
curl -s -H "Authorization: Bearer $YNAB_TOKEN" -H "Content-Type: application/json" "$A/months/2026-10-01"
```

- Useful endpoints (docs: https://api.ynab.com/v1): `POST /accounts` (`type: "creditCard"`,
  `balance` in milliunits), `POST /transactions` (a transfer is `payee_id` = the other account's
  `transfer_payee_id`; YNAB creates both sides), `PATCH`/`DELETE /transactions/{id}`,
  `PATCH /months/{month}/categories/{id}` (`budgeted`), `GET /months/{YYYY-MM-01}` (Ready to
  Assign as `to_be_budgeted`, and each category's `budgeted`/`activity`/`balance`), `GET /accounts`.
- Amounts are **milliunits** (1000 = $1.00).
- **Reads straight after a write can be stale.** A month read right after creating a transaction
  has missed its effect. Wait a few seconds before reading, and confirm a delta by deleting and
  re-adding the transaction: both directions must move the numbers by the same amount.
- Use a fresh category and a fresh card per case. A busy test plan makes deltas hard to
  attribute.
- The API can't create a line of credit or loan account (`type` only takes checking, savings,
  cash, creditCard, otherAsset, otherLiability) and can't close, reopen or delete an account. Do
  those in the browser, then carry on through the API.
- The API returns YNAB's computed results (category balances, payment-category Available,
  Ready to Assign), which settles most budget-math questions. It does **not** show UI-only
  details: colours (cash vs credit overspending), messages and inspector copy, dialogs, and the
  Ready to Assign breakdown lines. Check those in the browser. Next month's `to_be_budgeted`
  shows how much cash overspending was deducted.
- Name test data so it's easy to spot ("Card X", memo "x-spend") and note what you created in
  your findings; the user may clean up the test plan.

If the app can't settle it (no browser tool is connected, or the case can't be reproduced):

- Don't guess and don't fill the gap with a "sensible default". Skip that part of the feature.
- Add an entry to `docs/verify.md`: the question, what you found (with links), the options you
  see, and what's waiting on the answer.
- Tell the user what you skipped and that it's in `docs/verify.md`.

The user checks `docs/verify.md` in YNAB and settles the entries in a separate session; then
build what was skipped and remove the entry. Never write "as YNAB does" in code or docs for
behaviour you haven't confirmed.

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
- Budget-scoped routes live under `/v1/budgets/{budgetId}/…` and authorize through
  `loadBudgetAccess(c, budgetId, permission?)` (`apps/api/src/lib/budget-access.ts`): non-members
  get 404, members lacking the permission get 403. Never query budget data without it.
- Budgets are Better Auth organization-plugin records (`budget`, `budget_member`,
  `budget_invitation`). Clients use `/v1/budgets`; the plugin's `/api/auth/organization/*`
  endpoints are blocked in `app.ts`. Roles live in `apps/api/src/lib/budget-access-control.ts`.
- Better Auth owns the `account` table (logins). The finance accounts table needs another name
  (e.g. `budget_account`).
- After changing API routes: `pnpm generate` and commit `apps/api/openapi.json` +
  `packages/api-client/src/schema.gen.ts` (a test fails if they drift).
- Schema changes: edit `packages/db/src/schema/*`, then `pnpm db:generate`; commit migrations.
  Never edit an applied migration. Primary keys are `newId()` (UUIDv7) text ids.
- New third-party deps go through the `catalog:` in `pnpm-workspace.yaml`.
- **Prefer well-maintained libraries over hand-rolled code.** Before building a general-purpose
  capability (drag and drop, date pickers, virtualization, parsing, charts, …), look for an
  actively maintained, widely used library and use it instead of writing our own; we don't want to
  own and maintain edge cases someone else already solved. Check maintenance (recent releases,
  open-issue health), bundle size and license first. Hand-roll only domain logic (budgeting rules,
  money math) or when no suitable library exists, and say why in a comment.
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
  owned/vendored code and are lint-exempt (Biome still formats them). The CLI prompts before
  overwriting an existing component and `-y` doesn't answer that; `-o` overwrites everything
  (including our local edits), so after `-o` restore existing files with `git checkout`. Local
  edits to vendored files are marked with an `everycent:` comment (e.g. `table.tsx` container
  ref, `autocomplete.tsx`).
- **Boolean `data-*` attributes.** Tailwind's `data-active:` (and similar) variants match the
  attribute's presence, so `data-active={false}` still styles as active. Render
  `data-x={flag || undefined}`; check newly vendored shadcn components for this.
- **Test typing.** `res.json()` from the Hono test client / `fetch` is typed `Promise<unknown>`;
  narrow with an explicit `as { ... }` cast at the call site rather than loosening the type.
- **Bundling workspace packages.** `apps/api`'s `tsdown.config.ts` uses `deps.alwaysBundle:
  [/^@everycent\//]` (tsdown 0.23 renamed `noExternal` to `deps.alwaysBundle`) since workspace
  packages ship TS source and must be bundled into the built server.
- **Auth emails and links.** Emails come from `c.var.deps.email` (`apps/api/src/lib/email`);
  their links go to the web app with the token in the URL fragment (`#token=`), and pages act
  only on a click, so a mail scanner opening a link changes nothing. Never put Better Auth's own
  `/api/auth/...` link URLs in an email. Accounts need a confirmed email to sign in; the test
  helper `signUp` confirms through the emailed link and signs in, and `emailsTo(app, to, kind)`
  reads the in-memory outbox. Change-email and the session list/revoke go through `/v1/me/*`
  (password check, no tokens to the browser); the matching Better Auth endpoints are blocked
  in `app.ts`.
- **Demo seed user.** `pnpm db:seed` creates `demo@everycent.dev` / `everycent-demo` (see
  `apps/api/src/scripts/seed.ts`) — a public dev-only constant, safe to show in docs.

## Before claiming done

`pnpm check` must pass.
