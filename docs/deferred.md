# Deferred work and known gaps

Things we knowingly left out or simplified, and where they have to be picked up. **Check this file
before starting a roadmap phase** and remove an entry once it's done.

## Multi-currency (phase 11)

- `account.currency` is stored, but the API only accepts the budget's base currency. Phase 11 must
  lift that check in `apps/api/src/routes/accounts` and add conversion wherever account amounts
  feed budget math (Ready to Assign, category activity, balances in the sidebar totals).
- Transactions store `currency` next to `amount`; today it always equals the account currency.
  Phase 11 adds the original amount/currency and applied rate (per-transaction rate lock).

## Budget math (phases 6–7)

- Starting balances of cash accounts (and credit accounts that start positive) are categorized to
  the internal "Inflow: Ready to Assign" category. Ready to Assign on the budget page is still a
  hard-coded zero until phase 6 computes it.
- Credit-card starting debt has **no category**. Phase 7 must treat it as existing debt to be paid
  from the card's payment category (YNAB: "assign money to cover the starting balance directly to
  the Credit Card Payment category").
- Deleting a category reassigns its **transactions** only. Phase 6 must also move assigned amounts
  (YNAB reassigns transactions, assigned amounts and available money).
- Closing an account with a non-zero balance creates a "Manual Balance Adjustment" transaction;
  for on-budget accounts it's categorized to Ready to Assign (as YNAB does). Verify this against
  the phase 6/7 math once it exists, especially for credit cards.

## Onboarding and fresh start

- The setup flow (`/budgets/$id/setup`) covers YNAB's "Personalize plan" and "Add accounts". Its
  third step, "Fund categories" (assign money), needs the phase 6 budget screen.
- Fresh start (`apps/api/src/lib/fresh-start.ts`) copies partners, categories, payees and
  accounts. When these exist, it must copy them too: targets (phase 8), scheduled transactions
  (phase 10), payee rules (phase 12).
- By decision, a fresh start drops all transactions, uncleared ones included; each account starts
  from its working balance on the fresh-start date as a single cleared Starting Balance. That
  balance leaves out future-dated transactions, so they're lost; phase 10 should carry them over
  as scheduled transactions.

## Transactions and register (phase 5)

- The register API pages with keyset cursors (100 rows a page) and filters/sorts on the server;
  each page still computes the running balance over the account's whole history. Measured on a
  30k-transaction account (local Postgres): about 100 ms a page, most of it the window over all
  rows. If big accounts get slow, compute the balance before the page's first row with one sum
  and run the window over the page only, or cache balances.
- Search uses `ilike` on payee, category, memo and account names (no index; fine at the sizes
  above). A `pg_trgm` index would help much bigger budgets.
- Filtered rows show the account's real balance at that point, so it can jump between rows; the
  register says so above the table. Sorting by anything but date hides the balance, as in YNAB.
- The register opens on all dates. The filter bar's category and payee lists are plain selects;
  they'll want a searchable picker once lists get long.
- Search and filters only find whole transactions: a split shows when one of its lines matches,
  with all its lines.
- Balances exclude transactions after the user's "today": `listAccounts` takes `?today=`; other
  account responses (update, move, reopen) use the server's UTC date. The web refetches the list,
  so it only matters to other API clients.
- Reconciled transactions show a lock and can't be unlocked from the register yet; the API
  accepts `cleared` on them. Phase 9 adds the reconcile flow and the "unlock?" warning.
- Payees can't be renamed, merged or deleted yet (payee management, phase 12). Unused payees
  stay in the autocomplete.
- shadcn has no Autocomplete wrapper, so `packages/ui/src/components/autocomplete.tsx` wraps Base
  UI's Autocomplete (payee field) with the combobox styling. Replace it if shadcn adds one.
- Editing an existing transaction is cell by cell (as YNAB does); a transaction can be moved to
  another account only from the All Accounts register (its account cell).

## Transfers (phase 5b follow-ups)

- A transfer whose other side is reconciled can't change date or amount, be re-pointed or be
  deleted (409 `TRANSFER_RECONCILED`). Phase 9's "unlock?" flow should offer to unlock it instead.
- Transfers to and from a credit card carry no category. Phase 7 must treat a payment from a
  budget account as moving money out of the card's payment category, and spending on the card as
  moving available money into it.
- The close-account dialog only zeroes the balance with a Manual Balance Adjustment. YNAB does
  the same; a "transfer the balance to…" choice was considered and left out for now.
- Both sides of a transfer use the budget currency. Phase 11 needs a rate on cross-currency
  transfers.

## Splits (phase 5c follow-ups)

- A split is edited as a whole (YNAB does the same); its lines can't be edited a cell at a time.
- The transaction a split's transfer line keeps in the other account only takes memo, cleared and
  category there (409 `TRANSFER_IN_SPLIT` otherwise); date, amount and deletion go through the
  split. The register hides those cells and the delete action.
- A split with a reconciled transfer side can't drop or re-point that line (409
  `TRANSFER_RECONCILED`); phase 9's "unlock?" flow should cover it.
- Category activity for split lines (phase 6) must read `sub_transaction`, not the split's own
  null category.

## Flags (phase 5d follow-ups)

- Flags are per transaction; split lines have none (YNAB is the same). Filtering by flag comes
  with 5e.
- The flag menu is a popover with plain buttons (`apps/web/src/components/flag-menu.tsx`), not a
  Radix dropdown, because it switches into a form for renaming. Arrow-key navigation between
  colors isn't there yet; Tab works.

## Accounts (phase 3 follow-ups)

- Changing an account's type is allowed only within the same family (cash, credit, loan,
  tracking). YNAB also allows switching between families, which has to move money in or out of the
  budget and create or remove payment categories. Revisit with phase 7.
- Loan accounts store interest rate, minimum payment and escrow, but nothing uses them until the
  loan features in phase 7.

## Budgets and sharing (phase 16)

- Invitations: the organization plugin's `budget_invitation` table exists but nothing uses it.
  Sending invites needs real email delivery (phase 1).
- There is no viewer role yet (YNAB has none; the roadmap lists it as an extra).
- `session.active_organization_id` (added by the plugin) is unused; the current budget lives in the
  URL.

## Libraries

- `@dnd-kit/react` is pre-1.0 (0.5.x). Expect API changes on upgrades; the drag-and-drop code is
  in `apps/web/src/components/category-list.tsx` and the account sidebar.
