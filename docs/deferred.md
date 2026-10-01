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
- Fresh start (`apps/api/src/lib/fresh-start.ts`) copies partners, categories and accounts. When
  these exist, it must copy them too: targets (phase 8), scheduled transactions (phase 10),
  payees and rules (phase 12). Payees aren't copied today.
- By decision, a fresh start drops all transactions, uncleared ones included; each account starts
  from its working balance as a single cleared Starting Balance.

## Transactions and register (phase 5)

- Transfer payees ("Transfer : <account>") aren't created yet; phase 5 adds them with transfers.
- Future-dated transactions are included in balances; phase 5 must exclude them until their date.
- The account page shows transactions read-only. Adding/editing/deleting them is phase 5.

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
