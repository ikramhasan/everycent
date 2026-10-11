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

- All overspending counts as cash overspending (it comes out of the next month's Ready to Assign).
  Phase 7 must treat spending on a credit card as credit overspending (new debt, yellow).
- Past months' negative banner ("Overdraft?") has no "Next Steps" link (a YNAB help page).
- The current month doesn't warn when a later month is negative (YNAB's future-months panel:
  "Ready to Assign in November is −$985.00 … Cover Overspending / Go to November").
- Undo/redo history is local to the open browser budget and deliberately disappears on reload, so
  partners cannot undo one another's history. Undo and redo still call the API, so the resulting
  budget/transaction state is saved on the server. It covers assigning, moving and auto-assign,
  plus single and bulk transaction create/edit/delete. A later partner edit to the same row can
  still make a local inverse stale; conflict detection needs a shared row-version design (phase 16
  real-time collaboration or phase 19 audit history).
- Auto-Assign lives in the inspector; the Ready to Assign banner's "Assign" pop-up isn't built
  (docs/verify.md). The assigned field has no Tab-to-next-category or calculator buttons yet (keyboard shortcuts phase).
- Assigning in an archived budget (after a fresh start) is allowed, as every other edit is.
- YNAB marks a category's Available with a calendar pill when a scheduled (future-dated)
  transaction is coming. We keep future-dated transactions as plain transactions until phase 10,
  so there's no pill yet.
- YNAB has a note per month ("Enter a note…" under the month name). Not built; no phase has it
  yet.
- The budget screen keeps YNAB's four fixed columns at every width; a narrow window scrolls the
  list sideways (YNAB's web app cuts it off the same way). A separate mobile pass will design the
  phone layout.
- The budget screen's row checkboxes select categories for the inspector (6d); the bulk actions
  on a selection are auto-assign's (6e).
- Funded card spending moves into each card's payment category (phase 7b), computed from history
  on every read (`fundedCardSpending`, no stored rows), cash first and then card activity in date
  order, equal same-day purchases by transaction id (all settled 2026-10-11, docs/verify.md).
  Uncategorized funds and returns card money like any category. Credit overspending (7c) is yellow and stays out of next month's Ready to
  Assign. Payments from budget accounts come out of the payment category (7d); statement credits
  and cash advances don't move payment money. A card's balance above zero is cash (7e, see
  "Credit lifecycle and loans" below). Uncategorized card spending counts as credit overspending,
  except its cash part on a positive card, as YNAB's "Uncategorized cash transactions … $2.00
  will be deducted" note suggests (cash part only).
- A payment category's Activity opens the card's register for the month with YNAB's Spending /
  Returns / Funded Spending / Payments & Returns summary. YNAB's window lists the card's own
  transactions with their categories; ours uses the same columns as other categories (Account,
  Date, Payee, Memo, Amount). "Cover Overspent Categories" switches to the Overspent view and past
  months hide the alert and Current Balance, as YNAB does; the Current Balance and Available for
  Payment lines aren't collapsible as YNAB's are (EVERYCENT-22). Auto-Assign on payment categories has Underfunded and Reduce
  Overfunding (8c), but its other options still use the spending labels (YNAB: Paid Last Month,
  Average Paid when only payment categories are covered).
- The overspent note under a category name ("Overspent. $14.00 of $10.00") is the same grey for
  cash and credit, as YNAB's is; only the Available pill and the inspector change colour.
- The funded-credit, credit-overspending and card-balance engine primitives the Phase 7 roadmap
  listed under 7a were moved to 7b/7c: they depend on which payment method YNAB treats as funded
  first, a 7c verification gate.

- Starting balances of cash accounts (and credit accounts that start positive) are categorized to
  the internal "Inflow: Ready to Assign" category.
- Credit-card starting debt has **no category** (YNAB's API reports Inflow: Ready to Assign; its
  register shows "Category not needed"). It's existing debt, paid from money assigned to the
  card's payment category (7c); `cardLedger` treats it as money to Ready to Assign, which counts
  only above zero, so it moves nothing.
- Deleting a category moves its transactions and assigned money to the category picked (YNAB
  reassigns transactions, assigned amounts and available money). Moving to Ready to Assign or
  Uncategorized returns the money to Ready to Assign.
- Closing an account with a non-zero balance creates a "Manual Balance Adjustment" transaction;
  for on-budget accounts it's categorized to Ready to Assign (as YNAB does). With the phase 6 math
  that takes the closing balance out of Ready to Assign, which keeps the budget's money equal to
  its accounts' (checked for cash accounts). For credit accounts the adjustment counts only by
  the balance above zero (7e; YNAB, docs/verify.md).

## Targets (phase 8)

- 8a–8b built every target YNAB's form offers: weekly, monthly, yearly and custom (set aside,
  fill up to, have a balance of; one-time or repeating), the inspector's Target section and editor,
  the row note and the yellow/green Available with its pie or check.
- 8c added Underfunded and Reduce Overfunding to Auto-Assign (in YNAB's funding order, stopping
  at Ready to Assign for the whole plan or a view), the Underfunded and Overfunded views, and the
  summary's "Cost to Be Me" / "October's Targets".
- 8d added Snooze (inspector switch, Zz pill, Snoozed view), progress bars with the On/Off toggle
  and the "Spent $x of $y" / "Fully Spent" notes.
- 8e added the two credit card payment targets (Pay Specific Amount Monthly, Pay Off Balance by
  Date) with "Create a Debt Payoff Target", the payment inspector's Target section and their place
  in Underfunded, Reduce Overfunding and the month's targets. Not built there: the form's "Making
  minimum payments?" help link (YNAB's help center; everycent has none), "Cover Overspent
  Categories", and loan "Monthly Debt Payment" targets (they need 7f's loan activity).
- Not yet: the rollover section of a dated "Set aside another…" target (support.ynab.com: money
  left at the end of the last target period gets its own first section; drawn as one section for
  now); YNAB's Shift+Z snooze shortcut (keyboard shortcuts phase).
- Underfunded ignores scheduled transactions (phase 10); YNAB funds them with the due-date step.
- 8f added the summary's Expected Income (with its bars), YNAB's start-month rule for changed
  targets, and the past/future month details (no Assign in past months, the snooze switch disabled
  outside the current month). A fresh start doesn't copy the expected income yet (not seen in
  YNAB, docs/verify.md).
- Target edits aren't in the undo history (docs/verify.md).
- A category's history is reassigned on delete, but its target is deleted with it.

## Credit lifecycle and loans (phase 7e–7g)

7e is built (2026-10-11, EVERYCENT-2); 7f–7g (loans) wait. `docs/verify.md` ("Credit lifecycle
(phase 7e)") has what YNAB showed and what's still open.

- **Positive card balances (7e)** are built: `cardLedger` walks each card's lines by date and
  splits them at zero, including transfers between two cards and a split's lines in their order
  (all checked in YNAB, docs/verify.md). A payment target on a card above zero follows YNAB (it
  can't be created there; an existing one reads "Cheers to a debt-free future!" when met).
- **Closing** keeps the payment category visible, uses YNAB's dialog wordings and the "Closed
  Account" memo; a zero-balance account closes without a dialog. Edit account offers Close, or
  Delete while an account has only its starting balance; a closed account offers Re-open and
  Delete (disabled with YNAB's tooltip while it has history).
- **Working Balance** in Edit account adds a cleared Manual Balance Adjustment (EVERYCENT-113);
  loans don't have it until 7f decides what a loan's edit dialog holds.
- **Account types:** YNAB can't change an account's type at all. everycent allows changes within
  a family (no money moves). Kept as is; cross-family changes are not planned.
- **Loans (7f–7g):** no loan activity (principal, interest, escrow) and no payoff planner. Loan
  accounts store rate, minimum payment and escrow, unused. Phase 8's loan debt-payment targets
  need 7f, so they wait too.
- Lines of credit are treated as credit cards, as YNAB does (re-checked 2026-10-11, docs/verify.md).

## Onboarding and fresh start

- The setup flow (`/budgets/$id/setup`) covers YNAB's "Personalize plan" and "Add accounts". Its
  third step, "Fund categories" (assign money), needs the phase 6 budget screen.
- Fresh start (`apps/api/src/lib/fresh-start.ts`) copies partners, categories (with their
  targets, which start in the fresh start's month), payees and accounts. When these exist, it must
  copy them too: scheduled transactions (phase 10), payee rules (phase 12).
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
- Search follows YNAB's syntax (`parseSearch` in `@everycent/engine`) and uses `ilike` (no
  index; fine at the sizes above). A `pg_trgm` index would help much bigger budgets.
- Search terms YNAB has that wait for their phases: `Income:` (income for future months, phase 6)
  and `Is:` Matched, Approved, Unapproved, Needs Category, Unapproved or Needs Category (phase
  13). Typed, they're searched as free text for now.
- Like YNAB, a term can't contain a comma (commas separate terms), so amounts with a thousands
  separator ("1,000") don't work as one term; type "1000".
- Sorting: YNAB stacks sorts (sort by payee, then date: date then payee) and sorts Outflow and
  Inflow, the flag column and pending transactions separately. We sort by one column at a time;
  Outflow and Inflow both sort by amount, and there's no flag sort.
- The View menu has no "Show Images" (no attachments yet).
- Balances exclude transactions after the user's "today": `listAccounts` takes `?today=`; other
  account responses (update, move, reopen) use the server's UTC date. The web refetches the list,
  so it only matters to other API clients.
- Reconciled transactions keep their lock for good (YNAB can't unreconcile); edits that can put
  a reconciliation out of balance ask first (phase 9, docs/verify.md "Reconciliation").
- The Reconcile popover leaves out YNAB's "How do I find my account balance?" link and the
  difference step's help-doc box: everycent has no help center yet.
- Payees can't be renamed, merged or deleted yet (payee management, phase 12). Unused payees
  stay in the autocomplete.
- shadcn has no Autocomplete wrapper, so `packages/ui/src/components/autocomplete.tsx` wraps Base
  UI's Autocomplete (payee field) with the combobox styling. Replace it if shadcn adds one.
- Editing an existing transaction is cell by cell (as YNAB does); a transaction can be moved to
  another account only from the All Accounts register (its account cell).

## Transfers (phase 5b follow-ups)

- A transfer whose other side is reconciled can be changed or deleted after YNAB's warning; the
  other side follows and stays reconciled (phase 9). Undoing a deleted transfer brings its other
  side back uncleared.
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

## Bulk edit (phase 5f follow-ups)

- Built, as checked in YNAB: Categorize (un-split dialog; splits with transfer lines stay split),
  Flag, Clear / Mark as Cleared / Mark as Uncleared (reconciled rows skipped), Memo… (replaces),
  Move to Account and Delete (no confirmation), skipping the rows an action doesn't apply to.
- YNAB deletes with no confirmation because it has Undo/Redo in the register toolbar. Single and
  bulk transaction deletes can now be undone locally during the current page lifetime; reloading
  intentionally clears that history so partners never share an undo stack.
- YNAB's Categorize menu is category groups with their categories as submenus; ours is the
  category picker the register uses. Its keyboard shortcuts (K, C, shift F then 0–6) aren't in.
- YNAB's other bulk actions wait for their phases: approve/reject and match (13), duplicate,
  enter now and make repeating (10), and Export (no phase yet).
- Changing the search or filters clears the selection.

## Flags (phase 5d follow-ups)

- Flags are per transaction; split lines have none (YNAB is the same). Filtering by flag comes
  with 5e.
- The flag menu is a popover with plain buttons (`apps/web/src/components/flag-menu.tsx`), not a
  Radix dropdown, because it switches into a form for renaming. Arrow-key navigation between
  colors isn't there yet; Tab works.

## Accounts (phase 3 follow-ups)

- Changing an account's type is allowed only within the same family (cash, credit, loan,
  tracking). YNAB doesn't allow changing an account's type at all (support.ynab.com "Changing an
  Account Type"; its Edit Account dialog has no type field), so cross-family changes aren't
  planned.
- Loan accounts store interest rate, minimum payment and escrow, but nothing uses them until the
  loan features (phase 7f–7g, deferred).

## Budgets and sharing (phase 16)

- Invitations: the organization plugin's `budget_invitation` table exists but nothing uses it.
  Sending invites needs real email delivery (phase 1).
- There is no viewer role yet (YNAB has none; the roadmap lists it as an extra).
- `session.active_organization_id` (added by the plugin) is unused; the current budget lives in the
  URL.

## Libraries

- `@dnd-kit/react` is pre-1.0 (0.5.x). Expect API changes on upgrades; the drag-and-drop code is
  in `apps/web/src/components/category-list.tsx` and the account sidebar.
