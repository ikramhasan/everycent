# Verify against YNAB

How YNAB behaves in cases we couldn't confirm from its help center. Each entry is skipped in the
app until it's settled here (see "Matching YNAB" in `CLAUDE.md`). Check each one in YNAB, write
down the answer, and a later session builds it and removes the entry.

Entries marked **Built so far (before this rule)** are small gaps inside a feature that was
otherwise confirmed in YNAB (web app, 2026-10-02); the app needed some behaviour to work at all,
so it has one. Change it if YNAB differs.

## Register search and View menu (phase 5e) (settled 2026-10-11)

Checked in "ihni7's Plan" and "Onboarding Check" (EVERYCENT-12, EVERYCENT-13):

- **Picked terms:** "Outflow equals $0.00" writes `Outflow: 0,`; the date picks are "On
  10/02/2026", "On or before …", "On or after …" and write `On:`, `Before: 10/02/2026,`, `After:`.
  As built.
- **Free text** matches the account name too (`Zqx` found both transactions of the account
  "Zqx Acct", whose payees, categories and memos don't contain it). As built.
- **Search and filter both hiding rows:** the search message ("Some transactions are hidden by
  your search for "x-rec"."), with reconciled transactions hidden as well. As built.
- **The search is remembered** per plan and account (All Accounts too) in the browser
  (`{plan}_{account}_searchText` in localStorage) and comes back when you return, even days
  later. Built: `everycent:register-search:*` in localStorage (not when jumping to a transfer's
  other side, which opens unfiltered).
- **View menu options** are kept in the browser, per plan and account (`{plan}_{account}_account_filter`
  in localStorage). As built.
- **All Dates' "From"** is the month of the plan's oldest transaction, in every account: August
  2026 in "ihni7's Plan" (oldest transaction 08/15) even for Card E3, whose own transactions are
  all October; September in "Onboarding Check" (oldest 09/01). "To" is ten years past this month.
  Built (it used to start at the current month).
- YNAB also offers `Income:` ("Enter month like 'Income: October 2026'"), still listed in
  `docs/deferred.md`.

## Scheduled transactions (phase 10a) (settled 2026-10-11)

Checked in "Onboarding Check" (accounts S10 Chk, S10 Sav, S10 Cash, S10 Cash2, memos `x-*`) in the
web app and through the API, reading `date_next` after each Enter Now (EVERYCENT-4). All built:

- **Repeat options** (the date picker's "Repeat:"): Never, Daily, Weekly, Every other week, Twice
  a month, Every 4 weeks, Monthly, Every other month, Every 3 months, Every 4 months, Twice a year,
  Yearly, Every other year.
- **Month-based repeats** count from the first date and fall on its day or a shorter month's last
  day: 10/31 → 11/30 → 12/31 → 1/31 → 2/28; 11/30 every 3 months → 2/28 → 5/30 → 8/30.
  **Yearly** ones step from the previous date, so Feb 29 drifts (2028-02-29 → 2029-02-28 → … →
  2032-02-28). **Twice a month** pairs a day up to the 15th with day + 15 in the same month, a
  later day with day − 15 in the next month (20th ↔ 5th, 31st ↔ 16th); the later day lands on a
  short month's last day and comes back (1/31 → 2/16 → 2/28 → 3/16 → 3/31). The help center's
  "15 days later" is approximate (10/20 → 11/05).
- **Due occurrences** are entered by themselves, every missed one (daily from 10/05 entered
  10/05…10/11), dated their own date, **unapproved**, uncleared; in a cash account cleared. The
  flag comes along. A due transfer enters both sides unapproved, each side cleared by its own
  account's rule; a transfer into a closed account is still entered.
- **Enter Now** dates it today, approved (cleared in a cash account), and the schedule moves to
  its next date; a "Never" one is done. It works from the other side of a scheduled transfer and
  from a split's transfer line (the whole split is entered).
- **There's no Skip** in the web app: the help center's way is to change the date.
- **Saving a date on or before today** (a new repeating transaction, or an edited schedule)
  enters that one occurrence unapproved and starts the schedule at its first date after today
  (monthly from 9/01 added on 10/11: 9/01 entered, next 11/01). A new date resets the first date;
  so does a new frequency (twice a month → monthly re-anchored at the shown 12/16); a memo-only
  edit keeps it.
- **A plain transaction's date moved into the future** makes it a scheduled one (Repeat: Never).
- **Register:** a collapsible "Scheduled Transactions" section on top, newest first, one row per
  schedule, with a repeat icon; the new-transaction row sits above it. Its collapse is remembered
  per account. Search and the View date range filter scheduled rows (by next date), which count
  as uncleared (`Is: Uncleared` keeps them, `Is: Cleared` hides the section). A scheduled transfer
  shows in the other account (amount negated) and can be edited there; a scheduled split's
  transfer line shows in its account with no repeat icon and can't be deleted there.
- **Closed accounts** (help center): schedules stop occurring and new ones can't be added; Enter
  Now still works. Whether missed dates catch up on reopening is EVERYCENT-115.

## Scheduled transactions in the plan (phase 10b) (settled 2026-10-12)

Checked in "Onboarding Check" (categories U10 A–J, memos `x-u10-*`, Card W), new plans "C4
Order" / "C4 Order FS" (fresh start) and "C4 Clean", and on support.ynab.com ("Underfunded",
"Colors and Icons", "Scheduled Transactions", "Plan Resets and Fresh Starts"). Built:

- **Upcoming per category and month:** the month's occurrences after today count, inflows netted
  against outflows (U10 A, −$30 and +$25 → "2 Upcoming Transactions −$5.00"); a weekly $10 is 3 in
  October after 10/12 and 4 in November; a later month counts only its own occurrences. Split lines
  count in their own categories; spending on a card counts in its category; a payment from a
  budget account counts against the card's payment category. A scheduled Ready to Assign inflow
  counts nowhere.
- **Inspector:** under Available Balance (a payment category: under Available for Payment), "N
  Upcoming Transaction(s)" with the net amount, then "Available After Upcoming", yellow when
  negative. The first line opens an Activity popover (Account, Date, Payee, Memo, Amount, latest
  first, Close); a row opens the schedule's register.
- **Pill:** yellow with a calendar when Available doesn't cover them, over a target's pie or check
  (U10 D unmet, U10 I met); green without it when covered; a snoozed target keeps its Zz on yellow
  (help center).
- **Underfunded:** the larger of the target's need and what Available doesn't cover (U10 B $20,
  D $40 with a $40 target and $30 scheduled, I $20), funded whole at the category's earliest
  upcoming date ("C4 Order": Utilities with 10/15 and 10/27 before Rent's 10/24; "C4 Order FS":
  X10's $10 target and $6 on 10/16 before $6 on 10/20). A scheduled card payment: Card W, owing
  $10 with $5 scheduled, still asked $10.
- **Fresh start** copies every schedule unchanged; the archived plan keeps them too.
- **Auto-entry** is done by YNAB's client with the device's local date: at 00:25 local (+06,
  still 10/11 in UTC) opening the web app entered a 10/12 schedule at once; one created with no
  client open waited until the app was opened. There's no server job: `x-tz-server` (10/12),
  planted in "C4 Clean" and never opened, was still scheduled at 2026-10-12 10:57 UTC with no
  transaction entered. A plan nobody opens enters nothing, so everycent's catch-up on reads
  matches and has no background job.

## Duplicate, Enter Now and Make Repeating (EVERYCENT-40) (settled 2026-10-11)

Checked in "Onboarding Check" (S10 Sav, S10 Cash2, R9 Chk A, All Accounts; memos `x-dupc`,
`x-dupx`), read back through the API. All built:

- **Which actions show:** Enter Now only when every selected row is scheduled; Make Repeating only
  for exactly one plain transaction; Duplicate for any selection. A mixed selection gets the
  transaction actions (Flag, Memo, Move, Delete, Categorize), applied to the scheduled rows too.
- **Duplicate** copies each row (same date, payee, category, memo, amount, flag, cleared state;
  reconciled becomes cleared) as approved, and selects the copies. A transfer gets a new pair (one,
  even when both sides are selected); a split with a transfer line gets a new split and
  counterpart; a split's transfer side copies the whole split. A scheduled row copies its schedule
  from its next date (either side of a scheduled transfer); a scheduled split's transfer line in
  the other account isn't copied.
- **Enter Now** on several scheduled rows enters each as the single Enter Now does and selects
  the entered transactions.
- **Make Repeating** (the row menu, the action bar, a plain row's date picker) opens a new row on
  top prefilled from the transaction, a month later, Repeat: Monthly, with the date picker open;
  the original stays.

## Bulk edit (phase 5f) (settled 2026-10-11)

Checked in "Onboarding Check" (accounts R9 Chk A / R9 Chk B, memos x-split1, x-split2, x-tr-rec,
x-clr1, x-clr2; EVERYCENT-14):

- **Two splits that both have transfer lines:** Categorize applies with no dialog; their other
  lines take the category and both stay split. As built.
- **Move a split into the account its transfer line points at** (selected with a plain row): the
  plain row moved, the split was skipped. As built.
- **Move with a reconciled other side:** moves with no prompt; the reconciled side stays
  reconciled and points at the new account. A reconciled row moves with no prompt too. Built
  (no more 409 `TRANSFER_RECONCILED`).
- **Delete with a reconciled other side:** asks first ("Delete Reconciled Transfer?", or
  "Delete N Transactions?") and then deletes both sides. A plain transfer deletes with no dialog.
  Built; the wording is in "Reconciliation (phase 9)" below.
- **"Move to Account" in All Accounts:** every open account, the selected row's own included; no
  closed ones. As built.
- **Clear:** shows only when every selected row is uncleared. Only cleared rows: no Clear, More
  has "Mark as Uncleared". Built (Clear used to toggle cleared rows back).

## Reconciliation (phase 9) (settled 2026-10-11)

Checked in "Onboarding Check" (R9 Chk A, R9 Chk B, R9 Card, R9 Track, R9 Liab, Card K) and the
help center ("Can I unreconcile a transaction?", "Reconciling Accounts", "Balance Adjustments").
Built in EVERYCENT-3 and EVERYCENT-113.

- **No unlocking.** "Once a transaction has been reconciled, it can't be unreconciled." The lock
  can't be clicked; changes go through after a warning and the transaction stays reconciled.
- **Reconcile** (button, Shift+E; closed accounts too, not loans): "Is your current balance
  $491.00?" (the cleared balance) No / Yes. Yes reconciles. No: "Current balance at your bank",
  Next; then "-$11.00 Difference" (bank − cleared) with an explanation and "Don't Show Again"
  (kept in the browser: `.skipDifferenceExplanation` in localStorage, for every plan); then a
  banner over the register that follows the cleared balance live: "This account's cleared
  balance in YNAB is **$11.00** higher / lower than your actual account." (Cancel, "Create
  Adjustment & Finish"), at zero "…is **the same** as…" ("Finish Reconciliation"). Cancel changes
  nothing.
- **Debt accounts** (card, liability): the amount typed is what's owed; "57" and "-60" both meant
  a negative balance.
- **Finishing** locks every cleared transaction and adds, for a difference, a "Reconciliation
  Balance Adjustment" dated today, reconciled, memo "Entered automatically by YNAB" (ours says
  everycent), in Inflow: Ready to Assign on budget accounts (a card's −$7 didn't move Ready to
  Assign), no category on tracking accounts.
- **Header:** "Not Yet Reconciled", "Reconciled a few seconds ago", "Reconciled 4 minutes ago",
  "Reconciled 9 days ago" (moment-style relative time from `last_reconciled_at`).
- **Edit warnings** (single edits only; bulk actions have none except Delete):
  - reconciled row, amount: "Save Changes to Reconciled Transaction" / "Saving your changes to
    this reconciled transaction may bring your reconciliation out of balance." (Save);
  - reconciled row, account: "Move Reconciled Transaction" / "Moving this reconciled transaction
    to another account will bring the reconciliation out of balance." (Move);
  - transfer with a reconciled other side, amount, payee or account: "Save Changes to Reconciled
    Transfer" / "This transfer has already been reconciled in R9 Chk B." + "Any changes to this
    transaction will automatically modify the matching, reconciled transaction in R9 Chk B and may
    bring the reconciliation out of balance." (Save, or Move for an account change). The other
    side follows (re-pointed, it moved with the same id) and stays reconciled;
  - memo, date and category: no warning; a split's transfer lines: no warning, the other side
    follows and stays reconciled.
- **Delete warnings:** "Delete Reconciled Transaction?" / "Deleting a reconciled transaction will
  bring the reconciliation out of balance."; a transfer (or split) with a reconciled other side:
  "Delete Reconciled Transfer?" / "Deleting a transfer transaction will delete the transfer in
  both accounts." + "Some matching transfers in other accounts have been reconciled. Deleting
  these transactions could bring those account's reconciliations out of balance."; several rows:
  "Delete N Transactions?" with the transfer wording when any applies.
- **Edit Account → Working Balance** (open, non-loan accounts; a closed account's dialog has
  none): changing it adds a cleared "Manual Balance Adjustment", dated today, no memo, Inflow:
  Ready to Assign on budget accounts. Taken as typed: a card's "70" made it +$70.

## Budget screen (phase 6a)

Checked in YNAB's web app on 2026-10-02 and built as found: Activity leaves out future-dated
transactions (YNAB makes them scheduled transactions); hidden categories count in a "Hidden
Categories" row at the bottom, not in their group's totals; an "Uncategorized Transactions" row
shows only in months with uncategorized transactions; a negative Available starts the next month at
zero; months run from the one before the oldest transaction to the one after the current month (or
after the latest month with money assigned, which stays open even after an undo; a new empty plan
runs from the month before the current one); group collapse survives a reload and applies to every
month.

### Collapsed groups and the month on screen (settled 2026-10-11)

- **Collapsed groups** are kept in the browser (`.collapsedCategories` in localStorage, one list
  of group ids). As built (per budget in localStorage).
- **The month:** a reload of `/budget` opens the current month (November was on screen before);
  within the page's life, coming back to Plan reopens the month last viewed. Built: the sidebar's
  Budget link goes back to the last month viewed, kept in memory.

## Assigning and Ready to Assign (phase 6b)

Checked in YNAB's web app on 2026-10-02 and built as found (numbers from the test plan):

- Ready to Assign = income to Ready to Assign up to the month − money assigned up to the month −
  cash overspending of earlier months (Uncategorized included). October: $12,100 − $3 (August's
  overspending) = $12,097; assigning $50 → $12,047; November: $12,047 − $32 = $12,015.
- Money assigned in later months comes off the month's Ready to Assign ($20 in November took
  October to $12,027), but never pushes it below zero: $13,000 in November left October at $0.00
  "All Money Assigned" and November at −$985.00 "You assigned more than you have". September,
  with no income, stayed at −$3.00 whatever later months held.
- Assigning replaces the amount; the field takes math. YNAB has no separate "income for next
  month" any more: the category list offers only "Inflow: Ready to Assign".

### Negative Ready to Assign, "Assigned in Future Months" and setup's funding step (settled 2026-10-11)

Checked in YNAB plans "Onboarding Check" (categories V6b A/B, memo `x-v6b-over`) and a new
card-free plan "C4 Clean" (Rent $800 assigned in October, `x-c4-*` transactions), and on
support.ynab.com:

- **The wording follows the cause, not the month.** "Overdraft? We can help with that!" with
  "Next Steps" when Ready to Assign plus the cash in every category is still below zero (taking
  back all assigned money couldn't fix it); otherwise "You assigned more than you have" with Fix
  This, in past, current and future months alike. A category's cash is its Available, with cash
  overspending counted against it and credit overspending left out; payment and hidden
  categories count, Uncategorized doesn't. C4 Clean (income $1,000, Rent $800): a September
  overspend of $999 → −$799.00 "assigned more"; $1,000 → −$800.00 still "assigned more" (zero
  isn't an overdraft); $1,000.01 → "Overdraft?". With $999: +$5 uncategorized or a $5 credit
  overspend kept "assigned more"; a $5 cash overspend on Utilities made it "Overdraft?"; $10 of
  card spending from Rent (moving $10 to the payment category) and hiding Rent changed nothing.
  Built as `isOverdraft` (engine) and the month's `overdraft` flag.
- **Next Steps** opens YNAB's help article "Getting Out of Overdraft with YNAB" in a new tab.
  Not built: everycent has no help center (docs/deferred.md).
- **"Assigned in Future Months"** shows in the current month only: September and November didn't
  show it with money assigned in October–December. As built.
- **Setup's funding step:** YNAB's new-plan checklist is "Personalize plan", "Add accounts" and
  "Fund categories", which "opens Assign mode so you can assign your money" (support.ynab.com,
  "Creating a New Plan"); first-plan onboarding says to assign the money you have right now until
  Ready to Assign reaches zero ("Getting Started with YNAB"). Built: setup's third step points to
  the budget with that advice.

## Overspending and moving money (phase 6c)

Checked in YNAB's web app on 2026-10-02 and built as found:

- Clicking a category's Available opens "Move [amount] To [category]" (the amount starts at all
  that's available; Ready to Assign and every category are offered, with what each has). Moving
  money changes both categories' Assigned (Rent $50 → $40, Utilities $0 → $10); moving to Ready
  to Assign lowers the category's Assigned and raises Ready to Assign.
- An overspent category's Available opens "Cover overspending from [category]", offering Ready to
  Assign and the categories with money. It moves as much as the source has, up to the
  overspending ($3 from Rent left Groceries at −$2). Uncategorized's Available opens nothing.
- An overspent category says "Overspent. $spent of $had" ("Overspent. $25.00 of $10.00").
- "Fix This" on a negative Ready to Assign: "Un-assign money from [category]", offering
  categories with money; it takes back the shortfall, or as much as the category has.
- "Recent Moves" lists every change to assigned money by day: "Assigned $50.00 to Rent" (from
  Ready to Assign), "Removed $22.00 from Rent" (back to it), "Moved $3.00 from Rent to Groceries"
  (covers too), each with the month; filters All / Moved / Assigned. Undone changes drop out.
- Cash overspending comes out of the next month's Ready to Assign (see phase 6b).

### Moving limits, deleting categories, Recent Moves and Fix This's month (settled 2026-10-11)

Checked in YNAB plan "Onboarding Check" (group `Cycle 4`, categories V6c A–E, memo
`x-v6c-target`) and ihni7's Plan:

- **Moving more than a category has** is allowed: $15 out of V6c A's $10 left it at −$5.00
  (Assigned −$5.00). As built.
- **Deleting a category** with nothing assigned and no transactions (V6c E) happens at once, with
  no dialog. With money assigned but no transactions (V6c B $20; also V6c A at −$5): "Delete
  Category" / "There is money currently assigned to V6c B." / "When you delete this category, all
  assigned amounts will be moved to Ready to Assign." (Cancel / Delete; Ready to Assign +$20).
  With transactions (V6c C): "Before you can delete the category V6c C, you'll need to reassign
  your past activity to a new category." / Select category / "Here's what will be reassigned to
  the new category:" All transactions [1], All assigned amounts, Any remaining available amount.
  Built as found.
- **A deleted category's target** isn't moved: V6c D got V6c C's money and transaction but no
  target. As built.
- **Recent Moves keeps deleted categories:** older moves read "to deleted category V6c C", and the
  delete itself is logged with a trash icon under the Moved filter: "Removed $20.00 from deleted
  category V6c B", "Moved $30.00 from deleted category V6c C to V6c D" (its assigned money), and
  for a negative amount "Moved $5.00 from Ready to Assign to deleted category V6c A". Built
  (`money_move` keeps the name; `deletion` marks these).
- **How far back:** the button's tooltip says "Previous 34 days of assigning and moving money"
  (both plans); ihni7's Plan listed all 77 of its moves back to its first. Built as a 34-day window
  (was the latest 100). The test account is too new to see an older move drop off.
- **Who moved it** on a shared plan needs a second member in the YNAB plan (EVERYCENT-118).
- **Fix This's month:** in a past month (September) there's no picker, just the categories with
  Available. In the current or a later month a picker lists the current month through the last
  month with money assigned, or the month on screen if later (from November: Oct, Nov, Dec
  greyed out with nothing assigned, Jan; from February with nothing assigned: Oct–Feb, Feb
  selected). The month on screen is selected. The current month offers each category's Available;
  later months what's assigned in them (November: "V6b B $5,000.00" only, not V6c D's $44.00
  Available). Built as found.

## Category inspector, activity and views (phase 6d)

Checked in YNAB's web app on 2026-10-03 and built as found:

- Clicking a category's name selects it alone (it has a checkbox; "Check all" and a group's
  checkbox select many); clicking it again opens the editor. The sidebar then shows its name,
  "Available Balance" (the pill), Cash Left Over From Last Month, Assigned This Month, Cash
  Spending, Credit Spending, "You've overspent this category by $25.00. Cover this overspending or
  you can't trust your plan balances!" and Notes ("Enter a note...", saved on blur). Uncategorized
  shows dashes, its own message, and no note.
- Two or more selected: "N Categories Selected", their names, and the month's summary over them
  (Left Over from Last Month, Assigned in October, Activity, Available). Nothing selected: the
  summary over the rows in view.
- Activity opens a popover ("Activity", the name; Account, Date, Payee, Memo, Amount) for a
  category, a group or Uncategorized; zero Activity is disabled. A row opens its account's
  register on that transaction.
- Views: All, "3 Overspent" (left out when nothing is overspent, "0 Overspent" while it's on),
  Money Available. They leave hidden categories out, add "Some categories are hidden by your
  current view. View All", and when empty say "That's a win! You've knocked out all overspent
  categories." / "You don't currently have categories with money available." The view stays
  across months and reloads.

### Where the budget view is kept (settled 2026-10-11)

- In the browser, per plan (`{plan}_active_budget_view` in localStorage). As built.

### Group totals in a view and tracking balances in Activity (settled 2026-10-11)

- **Group totals in a view** cover only the categories in view: "Onboarding Check", group Cycle 4
  was $45.00 / −$3.00 / $42.00 under All and $0.00 / −$2.00 / −$2.00 under Overspent (only V6b A,
  memo `x-v6d-over`). Built (the list sums the categories in view).
- **A tracking account in a group's Activity popover:** ihni7's Plan's House starting balance
  carries a stale category in YNAB's data (the API reports ⚡️ Utilities), so YNAB's popover,
  which filters by category, lists it while Activity, which counts on-budget accounts only,
  doesn't. everycent never stores a category on a tracking-account transaction, so it can't
  happen. As built.

## Auto-Assign (phase 6e)

Checked against support.ynab.com ("Auto-Assign") and in YNAB's web app on 2026-10-03, and built
as found:

- The inspector's Auto-Assign lists Assigned Last Month, Spent Last Month, Average Assigned,
  Average Spent, Reset Available Amount(s), Reset Assigned Amount(s), each with an amount; singular
  labels when one category is selected. Underfunded and Reduce Overfunding came with targets
  (phase 8c, below).
- An option replaces Assigned (Groceries $50.00 → $30.00 with $30.00 assigned last month). With
  nothing selected it covers every visible category after "Auto-Assign Preview: …" ("This will
  update the assigned amount for 1 category.", the changes by group, "Update Assigned
  Amounts"); with categories selected it applies at once.
- Averages cover up to the last 12 months before the month, from the first with money assigned or
  spent ($30.00 assigned in September after $3.00 spent in August: $15.00 / $1.50).
- Reset Available works both ways: an overspent category is covered from Ready to Assign (Utilities,
  −$25.00 available, went to $25.00 assigned and $0.00 available).
- With nothing selected the options cover the rows in view (a view keeps them to its categories);
  a view with none says "This view has no categories. View All Categories". Labels go singular when
  one category is covered. Uncategorized has no Auto-Assign.

### Rounding, Reset Assigned and the banner's Assign menu (settled 2026-10-11)

- **Averages round half away from zero to the cent:** ihni7's Plan, R6e A–C with money assigned
  in August only. October (two months): $0.05 → $0.03, $0.07 → $0.04, $0.01 → $0.01, −$0.05 →
  −$0.03; November (three months): $0.05 → $0.02, $0.07 → $0.02, $0.01 → $0.00. Applying Average
  Assigned stored 30 milliunits, not 25. Built (was half-even).
- **Reset Assigned on the whole plan** opens the same "Auto-Assign Preview: Reset Assigned
  Amounts" with "Update Assigned Amounts". As built.
- **The banner's Assign pop-up** (while Ready to Assign is positive) has two tabs: **Auto**, the
  inspector's Auto-Assign list with amounts, and **Manually**: "Assign:" prefilled with all of
  Ready to Assign (selected), "To:" a category picker, Cancel / Assign. Not built yet
  (EVERYCENT-24).

## Cash and credit spending (phase 7a)

Checked in YNAB's web app on 2026-10-03 (test plan: cards "Visa" and "Amex" added at $0.00) and
built as found:

- The inspector's Cash Spending and Credit Spending are the net of the month's activity in cash
  and credit accounts, refunds included. Phone & Internet ($20.00 assigned): Wallet −$4.00 and
  +$10.00, Visa −$5.00, +$2.00 and a −$7.00 split line, Amex −$3.00 showed Cash Spending $6.00
  (positive, no sign) and Credit Spending −$13.00, Available $13.00.
- A split line counts by its transaction's account: the same Visa split's +$1.00 Groceries line
  showed Groceries' Credit Spending as $1.00 (Cash Spending −$5.00).
- Uncategorized splits the same way (Cash −$2.00, Credit −$1.00 from an Amex outflow with no
  category); see 7c below for its message.
- A category's Activity popover lists every transaction with its account; Visa and Amex rows sit
  beside Wallet's.

### Evidence for 7b and 7c (not built yet)

- **Payment category activity:** with the transactions above, the Visa payment category showed
  Activity $9.00 and Available $9.00 ("You have $9.00 set aside for payment"); Amex $3.00. Visa's
  Activity popover: Spending −$12.00, Returns +$3.00, Total Spending −$9.00, Funded Spending
  +$10.00, Payments & Returns −$1.00, Total Activity +$9.00. So the +$1.00 Groceries return on
  Visa (Groceries was overspent) seems to take $1.00 out of the payment category rather than
  count as funded; 7b/7d have to reproduce that before building it.
- **Uncategorized message:** "Uncategorized cash transactions still affect your plan! … $2.00
  will be deducted" quoted only the cash part (Available −$3.00). everycent does the same since
  7c, and only the cash part comes out of next month's Ready to Assign.

## Funded card spending (phase 7b)

Checked against support.ynab.com ("Credit Card Activity", "Underfunded Alert in the Credit Card
Payment Category") and in YNAB's web app on 2026-10-03 (test plan: cards Visa, Amex, Citi; test
categories T1–T6). Confirmed:

- Payment-category Available = Cash Left Over From Last Month + Assigned + Funded Spending −
  Payments Made (help center). Its Activity = Funded Spending − Payments & Returns; the Activity
  popover shows Spending, Returns, Total Spending, Funded Spending, Payments & Returns, Total
  Activity.
- Only the funded part moves: Rent ($10 assigned) with Wallet −$6 and Visa −$8 moved $4 to Visa's
  payment category; Rent ended −$4 ("overspent … with credit").
- Cash is funded first, whatever order the transactions were entered in on the same day:
  Transportation ($10) with Visa −$8 entered first moved $8, then Wallet −$6 cut it to $4.
- Spending and returns on the same card in the same category net out: Phone & Internet's Visa
  −$5, −$7 and +$2 counted as $10 of Funded Spending, not $12 with a $2 return.
- A card return in a category with no card spending that month moves money out of the payment
  category into the category, overspent or not: Vacation +$2 and Groceries +$1 on Visa each
  showed in Visa's Payments & Returns and raised the category's Available.

### Funding order and returns across cards (settled 2026-10-11)

Checked in the "Onboarding Check" plan (group "Gate 7e") through the API, with the web app
showing the same numbers. Built as found (`fundedCardSpending`, `packages/engine/src/credit.ts`):

- **Cash first, for the whole month:** $10 assigned (G-C1), Card R1 −$8 on 10/01, Wallet −$6 on
  10/05: adding the later cash purchase cut R1's funding from $8 to $4.
- **Then card activity in date order:** $5 assigned, F1 −$4 on 10/02 (older card, entered first)
  and F2 −$3 on 10/01: F2 got $3, F1 $2 (G-F1); with the purchases swapped F3 −$3 on 10/01 got $3
  (G-F2). The 2026-10-03 "newest card first" fit only same-day ties.
- **Same day, largest outflow first:** $5, F1 −$4 and F2 −$3 on one day → F1 $4, F2 $1 (G-T1);
  F1 −$3 and F2 −$4 → F2 $4, F1 $1 (G-T2). This is the register's same-day order, and the 7e
  finding that same-day outflows come before inflows.
- **Returns refill earlier unfunded card spending first:** G-X1 ($0): R1 +$5 on 10/01, R2 −$3 on
  10/02 → R1 −$5, R2 +$3, G-X1 $2. G-X2 ($0): R4 −$3 on 10/01, R3 +$5 on 10/02 → R4 $0 (stays
  unfunded), R3 −$2, G-X2 $2. A return in a category overspent in cash still leaves the payment
  category in full (Groceries, 2026-10-03).
- **Equal purchases on the same day** are funded in transaction id order, smallest first (4 of 4:
  G-E1–G-E4, Cards U2/U3, whatever the card or the entry order). YNAB's ids are random, which is
  why the 2026-10-03 cases looked like "newest card first". everycent's ids are time-ordered, so
  the same rule funds the earlier-entered purchase first.
- A first run (Cards F5–F10) was invalid: cards created through the API get their starting
  balance dated the day before, so returns dated earlier hit a $0 card and made it positive
  (7e rule). Cards R1–R7 carry their debt on 09/01 instead.

## Credit overspending and existing debt (phase 7c)

Checked against support.ynab.com ("Handling Credit Card Overspending", "Underfunded Alert in the
Credit Card Payment Category") and in YNAB's web app on 2026-10-03 (test categories R1–R3).
Built as found:

- The unfunded part of card spending is credit overspending: the category's Available goes
  negative and is drawn yellow ("You've overspent this category by $4.00 with credit. Cover this
  overspending to avoid creating debt!"); it is not deducted from next month's Ready to Assign.
  November's breakdown listed "Cash overspending in October −$31.00", which was exactly the
  red (cash) categories: Utilities $25, Groceries $4, Uncategorized $2.
- A mixed shortfall is cash first: R2 with Wallet −$3 and Citi −$2 and $0 assigned was red
  −$5.00 and added $3.00 (the cash part) to November's cash overspending; with $2 assigned it was
  red −$3.00 and added $1.00, Citi got nothing; with $4 assigned it turned yellow −$1.00, added
  nothing, and Citi got $1.00. So cash spending is funded first, the uncovered cash is cash
  overspending, and the rest is credit overspending. Red wins while any cash part is uncovered.
- Covering credit overspending in the same month moves the money on: R1 (Citi −$6, $0) was
  −$6.00 yellow; assigning $4 left it −$2.00 and Citi's payment category rose $4.00.
- Credit overspending doesn't roll over: R3's −$5.00 in September (Citi) started October at $0.00
  and October's Ready to Assign didn't change. Covering it afterwards (assigning $5 in September)
  moved $5 into September's Citi payment category, which carried into October (Citi $9.00 →
  $14.00) — the help center's "that money stays in the spending category" is about covering in a
  later month, which YNAB doesn't propagate back.
- Existing debt (a negative starting balance) gets no category and moves nothing; money assigned
  directly to the payment category reserves cash for it: Card A ($100 starting debt, $2 funded
  spending) with $10 assigned showed Available $12.00 = Assigned $10.00 + Funded Spending $2.00,
  Ready to Assign −$10.00.
- A payment category's pill is yellow ("cautious") whenever Available is below what's owed, and
  green when it covers it (Amex, positive balance, "Your Amex is paid off!"). The inspector shows
  "Total Underfunded" = Overspent Categories (this month's credit overspending on the card) +
  Underfunded (the rest of the balance), Current Balance (Prior Balance, Spending and Outflows,
  Payments and Inflows) and Available for Payment (Cash Left Over, Assigned, Funded Spending,
  Payments Made).

### Payment category messages and the next month (settled 2026-10-11)

- **Found (2026-10-03):** in October, Visa said "Overspent Categories — Cover $29.00 in overspent
  categories in order to pay off your current balance" with "Cover Overspent Categories" and
  "Create a Debt Payoff Target"; November said "Underfunded — You need to assign $29.00 more to
  pay off your current balance."
- **Both apply** (Card R4 in "Onboarding Check": $100 old debt, $9 of October credit
  overspending): only the Overspent Categories message shows ("Cover $9.00 in overspent
  categories…", "Cover Overspent Categories", "Can't cover the overspent categories?", "Create a
  Debt Payoff Target"); Total Underfunded $109.00 lists Overspent Categories $9.00 and Underfunded
  $100.00. everycent already does this.
- The $9.00 kept R4's $3 from G-X2, even though another card's later return refilled that
  category. A card's overspent categories are its spending left unfunded when it happened.
- **"Cover Overspent Categories"** moves no money: it switches the plan to the Overspent view
  (the "Overspent" filter chip), and Ready to Assign stayed the same. Not built yet (EVERYCENT-22).
- **Past months:** September (before the current month) showed the payment pills grey at $0.00
  and green at $2.00 for a card owing $100 (Card R6); the inspector there has no Payment section,
  no Total Underfunded and no Current Balance: only Target, Available for Payment (Cash Left Over,
  Assigned, Funded Spending, Payments Made), Auto-Assign and Notes. everycent's pill matches;
  its past-month inspector still shows Current Balance (EVERYCENT-22).

### Payment inspector sections, Auto-Assign labels and the card Activity window (settled 2026-10-11)

- **Current Balance** and **Available for Payment** fold to their title and total (chevron
  down/right); YNAB remembers it in the browser (`.is-budget-inspector-cc-current-balance`,
  `.is-budget-inspector-cc-available-for-payment` in localStorage). Each lists "Activity This
  Month" above its last lines. Built (EVERYCENT-22).
- **Auto-Assign:** one payment category selected (Visa in "ihni7's Plan"): Underfunded, Assigned
  Last Month, Paid Last Month, Average Assigned, Average Paid, Reset Available Amount, Reset
  Assigned Amount. Visa and Amex selected: "2 Categories Selected" with Spent Last Month, Average
  Spent and the plural Resets. As built.
- **Activity window** (Visa, Card T5): columns Date, Payee, Category, Memo, Amount (no Account);
  categories read "Group: Category"; a payment ("Transfer : Wallet") reads "Credit Card Payments:
  Card T5"; a split on the card is listed line by line (G-S5b −$5.00, G-S5a −$3.00, payee
  GateS5). Built.

## Payments, returns and statement credits (phase 7d)

Checked against support.ynab.com ("Credit Card Refunds and Returns", "How to Handle Credit Card
Rewards and Statement Credits", "Paid in Full Credit Cards") and in YNAB's web app on 2026-10-03
(Citi card, Wallet, test category R4). Built as found:

- A payment is a transfer from a budget account to the card (register category "Credit Card
  Payments: Citi"). It takes the amount out of the card's payment category in the payment's month
  (Citi $14.00 → $8.00 for $6.00) and leaves Ready to Assign alone. The Activity popover lists it
  under Payments & Returns; the inspector under "Payments Made" and the balance's "Payments and
  Inflows".
- Paying more than is set aside makes the payment category negative and red (−$2.00: "You sent
  more to Citi than you had set aside for the payment."). That negative is cash overspending: it
  came out of November's Ready to Assign (cash overspending in October $31.00 → $33.00) and
  November's payment category started at $0.00.
- A payment while the money isn't there (R4: $5 of card spending, unfunded) still takes it out:
  Citi −$2.00 → −$7.00.
- A card inflow to Inflow: Ready to Assign (a statement credit) only lowers the card's balance:
  Ready to Assign and the payment category didn't change (support.ynab.com: "It also won't change
  the amount you have set aside for payment or the amount in Ready to Assign (unless that inflow
  creates a positive balance on your credit card)").
- A card refund categorized to a spending category moves money from the payment category to that
  category (support.ynab.com; 7b found it for funded and overspent categories). It can push the
  payment category negative (support.ynab.com: "If you've already used the $10 from the original
  purchase to pay down the balance"); there's no cap.
- A transfer out of a card to a budget account (a cash advance) leaves the payment category alone
  and raises the card's debt with nothing set aside for it. **Corrected by the 7e gate
  (2026-10-11):** it does raise Ready to Assign, by the part that becomes new debt. Card W (owing
  $5) → Wallet $3 raised October's Ready to Assign by $3, confirmed by delete and re-add. The
  original reading here ("raised Ready to Assign by nothing") was taken in the web app with other
  changes in flight. everycent doesn't do this yet; 7e builds it (see "Credit lifecycle" below).

### Refunds in a later month or larger than the month's purchases (settled 2026-10-11)

- Card R6: −$10 in G-X5 in September (unfunded), +$10 refund in October: the refund took its whole
  $10 out of R6's payment category in October. Card R7: −$2 then +$6 in G-X6 in October ($0
  assigned): $4 left the payment category. Both are what everycent already does.

### Payment from a tracking account (settled 2026-10-11)

- A transfer from a tracking account (Track T) into a card in debt is never a payment; it acts as
  an inflow on the card with the category its card side has: Inflow: Ready to Assign changed
  nothing (like a statement credit); a spending category (G-Y) got +$5 and the card's payment
  category gave up $5 (like a refund). everycent already does both (API test "treats a categorized
  transfer from a tracking account as a refund"). Left uncategorized, it also took $5 out of the
  payment category and next month's Ready to Assign moved by +$3; not built (an uncategorized
  card inflow is an open question, not checked further).

## Credit lifecycle (phase 7e)

Checked against support.ynab.com ("Credit Cards with a Positive Balance", "How to Close or Delete
Bank Accounts", "Correcting Balances in Closed Accounts", "Changing an Account Type", "Line of
Credit Accounts") and in YNAB on 2026-10-03 (cards P–Y, LOC A/B). Re-checked on 2026-10-11 in an
empty plan ("Onboarding Check", group "Gate 7e": Wallet, Cards X/U1/S1/S2/Z/A/V/W/P/Y/K, LOC G/H,
categories G-S1, G-S2, G-Z, G-K, G-L1, G-L2) through the API, waiting 6–8 s after each write and
confirming every delta by delete and re-add; dialogs and colours in the web app. Built as found
in phase 7e (`cardLedger`, `packages/engine/src/credit.ts`).

**The rule that fits every reading:** a card (or line of credit) balance above zero is cash. Each
card transaction is classified by the card's balance just before it, on its date, with outflows
dated the same day as an inflow applied before the inflow:

- Money moving a card above zero adds the part above zero to Ready to Assign: a $10 payment from
  Wallet to a $0 card (Card X) raised October by $10 and left the payment category at −$10, red
  (cash overspending: November gave the $10 back). Statement credits and other inflows to Inflow:
  Ready to Assign do the same ($8 in on Card V at −$5 → +$3, web app 2026-10-03).
- Money moving a card down from above zero, with no spending category, takes the part above zero
  out of Ready to Assign: $5 out (to Inflow: Ready to Assign) of Card V at +$3 → −$3; $2 out of
  Card W at −$5 → nothing. Closing a card is the same: Card P at +$10 closed → −$10.
- A cash advance (card → budget account) is the Wallet's inflow less what the card lost above
  zero: Card A at +$6 → Wallet $8 raised Ready to Assign by $2; Card W at −$5 → Wallet $3 by $3.
- Spending (categorized or not) while the card is above zero is cash spending up to the part above
  zero; the rest is credit. Uncovered cash is cash overspending (red, deducted next month); the
  credit part works as in 7b/7c (funded, or yellow credit overspending, not deducted).
  - Card U1 at +$10, −$4 uncategorized: November −$4, October unchanged (cash).
  - Card S2 paid $10 on 10/03, −$4 in G-S2 on 10/05: November −$4 (cash, red).
  - Card S1 paid $10 on 10/05, −$4 in G-S1 the same day: October −$4, November no further
    deduction, G-S1 yellow (credit overspending). The spending counted before the payment, so the
    card was at $0 and the payment only took it $6 above zero. Explains L5/Card Z2 (2026-10-03).
  - A return pays down debt first (delete and re-add, 2026-10-11): +$5 in G-Q1 on Card R8
    owing $3 took $3 out of its payment category (red, deducted next month), G-Q1 got $5 and
    October didn't change. A return to a $0
    card is all cash and leaves the payment category alone (Q6/Card T, 2026-10-03); the help
    center's "clothing" example (refund after paying off takes from the payment category) isn't
    what the app does.
  - Card Z at +$5, −$3 in G-Z alone: November −$3 (cash). With −$4 uncategorized dated the day
    before: the uncategorized −$4 is cash and only $1 of the −$3 is; November −$2 net (−$4 + $2).
    Explains the "only $1" reading on Card Z1.
- Equivalently: Ready to Assign = cash in budget accounts + card balances above zero − category
  Available (credit overspending excluded) − future assignments, which every reading above
  satisfies.

**Closing a card or line of credit:**

- A card with only its starting balance offers "Delete Account" instead of "Close Account" in
  Edit Account (Card Y before its first payment); not tested further.
- Closing creates "Manual Balance Adjustment", category Inflow: Ready to Assign, dated the day of
  closing, memo "Closed Account", for minus the balance, and follows the rule above.
- Dialog for a positive balance (Card P at +$10): "Close Account" — "Before you can close this
  account, the balance will have to be zeroed out. An adjustment transaction will be created for
  -$10.00." plus an info box "The money in this account will be removed from your plan. If you
  would like to keep it in your plan, you can transfer it to another account before closing this
  one." Buttons "Cancel" and "Adjust Balance & Close".
- Dialog for a debt (Card Y owing $20): the same title, first sentence ("…created for $20.00.")
  and buttons, no info box. A cash account with money in it (Wallet, $924.00, dialog opened and
  cancelled) shows the info box too, so it goes with a positive balance. Not seen: an overdrawn
  cash account or a tracking account (everycent shows the box for positive on-budget balances
  only). A $0 card (Card K) closed straight away with no dialog and no
  adjustment.
- The payment category keeps its money and stays visible; nothing goes back to Ready to Assign:
  Card Y kept $6 set aside (green, "Your Card Y is paid off! Being debt free is a wonderful
  thing."), Card K kept $5, Card P stayed at −$10 (red, deducted next month).
- Card Y's inspector after closing showed Prior Balance −$21.00 (the starting balance) and
  Payments and Inflows $21.00 (the $1 payment and the $20 adjustment).

**Transfers between two credit accounts** (2026-10-11, API, delete and re-add): the part paid from
the sending card's balance above zero acts as a payment from a cash account (the receiving card's
payment category gives it up); the rest pays down the receiving card's debt, and whatever takes
the receiving card above zero goes to Ready to Assign. The sending card's new debt adds nothing.
T1 at +$10 → T2 owing $20, $6: T2's payment category −$6, October unchanged, November −$6. T3
owing $10 → T4 at $0, $5: October +$5, no payment category moved. T7 owing $10 → T6 owing $2,
$5: October +$3, nothing moved. T1 at +$4 → T9 at $0, $3: T9's payment category −$3, October +$3.

**A split on a positive card** gives the cash part to its lines in their order: T5 at +$5 with a
−$8 split (G-S5a −$3 with $3 assigned first, G-S5b −$5 second) funded nothing and November lost
$2; with the lines the other way round (T8: G-S6b −$5 first, G-S6a −$3 with $3 second) the
second line's $3 was credit, funded, and moved to T8's payment category.

**Payment targets on a card above zero** (2026-10-11, web app): a positive card's payment
category shows only "Your Card T4 is paid off!" (no Target section, no "Create a Debt Payoff
Target"), so a target can't be added there. A target made while the card owed keeps working:
Card T7 (Pay Off Balance by Date, Nov 2026) after an overpayment asked $10.00 while its payment
category was −$20.00 (red: the alert shows instead of the target, as for E2); funded back to
$0.00 it read "Pay off $20.00", the check ring, "Cheers to a debt-free future!", Needed for
Payoff $0.00, Available for Payment $0.00, To Go $0.00, Edit Target, with a grey pill and a
check; at $5.00 "Pay off $25.00" and a green pill with a check, and Reduce Overfunding rose by
$5.00. A pay-off target met while the card still owes reads the same (Card T2: owes $14.00,
$14.00 available, "Pay off $20.00", "Cheers to a debt-free future!"), while a met Pay Specific
Amount Monthly target reads "You've met your target!" (Card T3). The "Pay off" amount is what's
been put in (carried and assigned, less this month's funded spending) plus To Go: E1 $50 + $75 =
$125.00, T7 $25 + $0, T2 $20 + $0.

**Reopening** (Card P, web app): a closed account's Edit Account dialog has only the nickname and
notes, with "Re-open", "Delete", "Cancel" and "Save". Re-open happens at once (no dialog); the
closing adjustment stays, the balance stays $0.00, and Ready to Assign doesn't change. Delete is
disabled while the account has transactions, with the tooltip "If you want to delete this
account, first delete all of the transactions in it and transfers pointing to it. Be cautious,
as this will potentially change your plan values." (Card Y). An open account's dialog offers
"Close Account", or "Delete Account" instead when it has only its starting balance.

**Uncategorized** funds and returns card money like any category: with $7.00 available, −$3 of
uncategorized spending on Card R4 moved $3 to its payment category; an uncategorized +$5 on Card
R3 (a transfer from Track T, category Uncategorized) took $5 out of R3's payment category and
added $5 to Uncategorized. An uncategorized inflow to Wallet just raised Uncategorized (−$3 →
+$2), which carried into November.

**Lines of credit** behave as credit cards (LOC G/H, API): G-L1 $5 assigned, −$8 on LOC G moved
$5 to its payment category and left G-L1 at −$3 not deducted next month; a $4 payment took the
payment category to $1; a $10 payment to LOC H at $0 raised Ready to Assign by $10; −$4 in G-L2
on LOC H while positive was cash (November −$4).

**Other:**

- Account types can't be changed (the Edit Account dialog has no type field); YNAB says to create
  a new account and move the transactions.
- A card refund to a $0 card goes to its category and leaves the payment category alone (Q6/Card
  T, 2026-10-03).
- In the API a credit starting balance and the closing adjustment both report category
  "Inflow: Ready to Assign"; the register shows "Category not needed" for the starting balance.
- When creating transactions through the API, YNAB fills in the payee's last category if none is
  given. Use a fresh payee (or none) for uncategorized test data.

## Monthly targets (phase 8a)

Checked in YNAB on 2026-10-03 through the API (`goal_*` fields; categories "T8 A"–"T8 N" in the
Test group, each a $100.00 monthly target, Brac transactions with memos `x-spend`, `x-refund`,
`x-open`) and in the web app (inspector, row notes, the target form; R4 got a $10.00 target from
November, T8 B's due day is the 15th). Built as found:

- **Set aside another…** counts only this month's Assigned: Assigned So Far is Assigned, whatever
  was carried in, spent or refunded (T8 E: $70.00 carried, $0.00 assigned → "Assign $100.00 to
  meet your target"; T8 C: $100.00 assigned, $30.00 spent → met; T8 D: $40.00 assigned, $20.00
  refund → $60.00 to go; T8 L: $150.00 assigned → met, "Assigned So Far $150.00").
- **Refill up to…** counts what was carried in plus this month's Assigned ("Funded"); the month's
  spending and refunds don't change it, moving money out does (T8 G: $70.00 carried → $30.00 to
  go; T8 H: same with $20.00 spent → still $30.00; T8 J: $40.00 assigned + $20.00 refund → $60.00
  to go; T8 M: $70.00 carried, −$20.00 assigned → $50.00 to go; T8 K: $70.00 assigned and $20.00
  spent in September → $50.00 to go in October).
- In a **future month** a Refill target ignores money carried in (T8 G in November: "Funded
  $0.00", "$100.00 needed by the 30th"); the API's `goal_under_funded` still counts it (its docs
  say the apps ignore it). Set aside asks for the full amount there too.
- To go = what's asked − what counts, never below zero. Met: "You've met your target!" and no
  percentage. Otherwise a percentage ring (funded ÷ asked) and "Assign $60.00 more to meet your
  target" ("Assign $100.00 to meet your target" with nothing counted yet) with an Assign button.
  Set aside lists "Amount to Assign This Month / Assigned So Far / To Go"; Refill "Needed This
  Month / Funded / To Go". Heading: "Set Aside Another $100.00 Each Month" or "Refill Up to $100.00
  Each Month", then "By the End of the Month" or "By the 15th of the Month".
- Row note: "Funded" when met ("Funded. Spent $30.00 of $100.00" with spending); otherwise
  "$60.00 more needed by the 31st" — Refill with nothing counted says "$100.00 needed by the 31st",
  Set aside always says "more". The due day only changes this wording; the numbers don't move.
- Available pill: yellow with a pie icon filled to the percentage while underfunded, green with a
  check when met (cash overspending stays red).
- The target applies from its creation month (API `goal_creation_month`). Before it the category
  shows no target ("How much do you need for T8 G? … Create Target"), with plain green/grey
  Available. A target is created in the month being viewed (R4 from November didn't show in
  October). Saving it from an earlier month moves its start back to that month; saving it unchanged
  from a later month leaves the start alone, but changing it starts it again in the month it's
  saved from (phase 8f, "Targets overview and history"). Editing changes every month from the
  start on.
- The form: Weekly / Monthly / Yearly / Custom; "I need" (calculator field); "By" (Last Day of
  Month, 31st … 1st); "Next month I want to" (Set aside another $X — "Use for: bills,
  subscriptions, saving over time", "Most people choose this" and the default; Refill up to $X —
  "Use for: gasoline, fun money, dining out"); Delete, Cancel, Save Target.

### Percentage rounding (settled 2026-10-12)

- **Rounded down, as built.** Plan "C4 Clean", group "C5 Targets", through the API
  (`goal_percentage_complete`): C5 R1 ($100.00 monthly set aside, $99.99 assigned) reads 99%;
  C5 W2 in November ($15.00 of $40.00) reads 37%.

### Small target details not seen in YNAB yet

- **Question:** (1) a due day past the month's end (the 31st in November): does the note say "by
  the 30th"? (2) The Available pill of a met target whose Available is $0.00 (all spent): grey,
  green, with or without the check? (3) A $0.00 target: can it be saved? (4) Do target edits show
  in YNAB's Undo?
- **Built so far (before this rule):** (1) the month's last day; (2) the plain colour rules (grey at
  $0.00) with the check; (3) refused, the amount must be positive; (4) target edits aren't in
  everycent's undo history.

## Weekly, yearly and custom targets (phase 8b)

Checked in YNAB's web app on 2026-10-03 (the API's write limit was used up). Test targets: T8 A
(weekly $10 Saturday, then custom $300 every 2 months, then "Have a balance of $300", then a
one-time custom $300 due Nov 30, which it is now), T8 F (yearly set aside $1,000 by Dec 30, $333.34
assigned in October), T8 G (yearly refill $1,000 by Nov 1, $70 carried in), T4 (form only, not
saved). Built as found:

- **The form.** Weekly: "I need", "Every" (Sunday … Saturday, today's weekday by default), "Next
  month I want to" (Set aside another $X/week, Refill up to $X/week). Yearly: "I need", "By" (a
  date; the first of next month by default), "Next year I want to" (Set aside another / Refill up
  to). Custom: "Amount", "I want to" (Set aside $X: "Add $X to this category, regardless of its
  current balance"; Fill up to $X: "Use what is already in this category and fill it up to $X";
  Have a balance of $X: "Use for: long-term savings. Reach this amount by a specific time and
  refrain from spending until you reach it."), "Due on" (a date), "Repeat" toggle with "Every [1–11]
  Month" or "Every [1–2] Year". "Have a balance of" has no Repeat; it has a "Due by date" toggle
  with a month and a year (this year to 49 years on) instead of a date. The API's legacy types map
  here: Target Balance is "Have a balance of" without a date, Target Balance by Date with one.
- **Weekly** asks the amount once for each time the weekday falls in the month: $10 on Saturdays
  asked $50.00 in October (5) and $40.00 in November (4). Heading "Set Aside Another $10.00 Each
  Week", "By Saturday"; the inspector reads like a monthly target ("Amount to Assign This Month").
  Row: "$50.00 more needed this month".
- **Dated targets (yearly, custom)** spread what's still missing over the months left up to the
  due month, rounding up: $1,000 by Dec 30 asked $333.34 in October (÷ 3); with October left empty
  November asked $500.00 (÷ 2) and December $1,000.00; with $333.34 assigned in October, November
  asked $333.33 and December $666.66. Set aside counts the money assigned in the period ("Assigned
  So Far"); refill counts what the category holds ("Funded": $70 carried → ($1,000 − $70) ÷ 2 =
  $465.00). A repeating target starts a new period the month after its due month (custom $300 every
  2 months due Nov 1 asked $150 in October and $150 again in December; the yearly refill due Nov 1
  asked $83.34 = $1,000 ÷ 12 in December, carried money not counted in a future month).
- Inspector for a dated target: "Set Aside Another $1,000.00 Each Year" / "Refill Up to $1,000.00
  Each Year" / "Set Aside Another $300.00 Every 2 Months" / one-time "Set Aside Another $300.00";
  then "By Dec 30 2026". While behind: "Assign $333.34 this month to stay on track" with Assign.
  When this month's share is in but the total isn't: "You're on track to meet your target!", row
  note "On Track", green pill with a part-filled pie; the ring shows the share of the total (33%).
  Lines: "Total to Assign by Dec 30 2026 / Assigned So Far / To Go" (set aside) or "Needed by Nov 1
  2026 / Funded / To Go" (refill), To Go being what's left of the total. Row: "$333.34 more needed
  this month", in the due month "$666.66 more needed by December 30th".
- **Have a balance of** without a date never asks for money this month: "Have a Balance of $300.00
  / Eventually", ring, no Assign box, "Balance Needed / Current Balance / To Go", row "$300.00
  needed eventually", grey pill with an empty pie, and it left Underfunded alone (it fell by the $150
  the earlier version of T8 A asked). With a date (Dec 2026): "By Dec 2026", "Assign $100.00 this
  month to stay on track", "Balance Needed by Dec 2026 / Current Balance / To Go", row "$100.00
  needed this month".

### Dated refill spending and weekly refill (settled 2026-10-12)

Plan "C4 Clean", group "C5 Targets", through the API; September money came from inflows (memo
`x-c5-carry`), spending has memo `x-c5-spend`. Both as built:

- **Spending this month doesn't change a dated refill's ask; spending in earlier months does.**
  Refill $1,200.00 by March 2027 with $300.00 carried in asked $150.00 in October (C5 D2), and
  still $150.00 after $120.00 was spent in October (C5 D1, Funded $300.00). With the $120.00 spent
  in September instead, $180.00 was carried in and October asked $170.00 (C5 D3).
- **Weekly refill** asks the weekly amount once per occurrence, less what was carried in and
  assigned: $10.00 a week asked $50.00 in October and $40.00 in November (C5 W1); $15.00 carried
  in → $35.00 (C5 W2); $25.00 assigned with $15.00 spent → $25.00 more (C5 W3).
- A dated balance target can't be created through the API (it only makes "NEED" targets), so its
  spending case wasn't run; everycent treats it like the refill.

### Details of 8b not seen in YNAB

- **Question:** (1) Settled above. (2) For set aside, does money assigned before the
  target's start month count toward the first period? (3) The inspector heading of a custom "Fill
  up to" target. (4) The weekly refill's numbers (only the form was seen). (5) Earliest due date the
  picker allows.
- **Built so far (before this rule):** (1) the month's share is worked out from what was carried
  in (spending this month doesn't change it), Funded and Current Balance show carried + assigned;
  (2) no, the period starts no earlier than the start month; (3) "Fill Up to $X …"; (4) as a
  monthly refill with the weekly amount; (5) any date.

## Underfunded and Reduce Overfunding (phase 8c)

Checked against support.ynab.com ("Underfunded", "Auto-Assign") and in YNAB's web app and API on
2026-10-07. Test data added to the test plan: categories O1–O13 in the Test group (O5's and O10's
targets later removed), Brac transactions with memos `x-spend` (October) and `x-carry`
(September inflows, because the API can't assign in a month before a category's creation). An
Underfunded "Assign Money" in the web app didn't persist after a reload, so the plan is unchanged
by it. Built as found:

- **Underfunded** per category = enough to meet the target and to cover overspending, whichever is
  more: O11 ($100 set aside, nothing assigned, $30 spent) asked $100.00; O13 (met, $130 spent of
  $100) asked $30.00; overspent categories without a target ask their overspending (Utilities
  $25.00). Categories with neither ask nothing (Phone & Internet with $13.00 left).
- Payment categories ask what's owed beyond Available, less this month's credit overspending on
  the card: Card B (owes $103, $3 set aside) $100.00; Card X (paid off, −$10.00) $10.00; Card Z3
  (owes $2, −$10.00) $12.00; Visa (owes $65, $31 set aside, $33 credit overspending) $1.00; LOC A
  $0.00. Cards with credit overspending are listed apart in the preview ("These credit cards may
  need more attention, because of credit overspending, or uncategorized transactions.") and are
  still funded (Assigned rose by the button's full $1,525.00).
- Underfunded adds to Assigned (T8 M −$20.00 → $30.00). The button shows the total to add; the
  preview says "45 categories will be fully funded." with the list by group and "Assign Money".
  The help center's order (overspending; scheduled and dated-this-month by date, weekly per
  occurrence; end-of-month monthly; later due dates; card payments; ties top to bottom), its stop
  at $0.00 Ready to Assign with nothing selected, and full funding of a selection are built as
  written there.
- **Reduce Overfunding** takes back this month's Assigned above what the month asks, never more
  than Available: T8 L ($150 vs $100) −$50.00; O1 ($150 assigned, $120 spent) −$30.00; O2/O8
  refill likewise −$50.00/−$30.00; O3 (refill, $80 carried + $50) −$30.00; O4 (refill, $150
  carried, nothing assigned) −$50.00, so Assigned goes negative; O9 (set aside, $100 carried +
  $150) −$50.00; O6 (weekly $10, asked $50, $70 assigned) −$20.00; O10 ($100 by Dec 31, $100
  assigned in October, this month's share $33.34) −$66.66. Payment categories give back Available
  above what's owed (Amex −$6.00, Card Y −$7.00). In November O4 and O9 weren't overfunded
  (carried money doesn't count in a future month). Preview: "This will update the assigned amount
  for 11 categories." and "Update Assigned Amounts".
- Options: with one category selected, Underfunded is left out when nothing is short (O4, O10)
  and Reduce Overfunding when nothing is over (O5). For a view or the whole plan Underfunded is
  always listed ($0.00 in the Overfunded view) and Reduce Overfunding only when something is over.
- **Views**: Underfunded lists every category Underfunded would add to (overspent ones and card
  payments included, and Uncategorized while negative); Overfunded those Reduce Overfunding would
  take from. Empty: "Cheers! You don't currently have any underfunded categories." / "You don't
  currently have any overfunded targets." (YNAB adds a mug illustration), with View All.
- **Cost to Be Me**: the summary's "October's Targets" adds up each target's month amount (monthly
  and weekly in full, refill too; dated targets this month's share, even when met: O10 $33.34;
  balance without a date $0) over the whole plan, whatever the view; "Next month's targets could
  increase your total to $2,703.33" below it. Shown only in the current month (not in September or
  November).

### Details of 8c not seen in YNAB

- **Question:** (1) The preview's wording when Ready to Assign runs out part-way (partly funded
  categories). (2) Reduce Overfunding on a "Have a balance of" target without a date. (3) A dated
  refill or balance target carrying more than its total. (4) Underfunded's first-month rule
  (targets due before the plan started go after those coming up). (5) Settled: "Next month's
  targets…" shows only when higher (support.ynab.com, 8f). (6) Whether hidden categories' targets
  count in October's Targets, and what the summary shows with categories selected. (7) Which
  "uncategorized transactions" put a card in the attention list. (8) Auto-Assign labels when
  several categories, all of them payment categories, are covered (one selected payment category
  reads "Paid Last Month", "Average Paid": seen in 8e, built).
- **Built so far (before this rule):** (1) "N categories will be fully funded." counting only the
  full ones, partly funded ones listed with what they get; (2) nothing is over; (3) the surplus
  over the total is over; (4) not built; (5) —; (6) hidden categories left
  out, Cost to Be Me only with nothing selected; (7) credit overspending only; (8) the usual
  labels for several.

## Snooze and progress bars (phase 8d)

Checked against support.ynab.com ("Snooze a Target", "Progress Bars") and in YNAB's web app on
2026-10-07: T8 E, O9 and O11 were snoozed in October (left snoozed), and categories P1–P3 were
added to the Test group (P1 set aside $100 with $80 carried in by a September inflow and $50 spent,
P2 weekly set aside $10, P3 weekly refill $10 with $15 spent; transactions with memo `x-bar`). The
bars were read from the page (section `flex-basis`, segment widths and classes). Built as found:

- **Snooze**: the inspector's "Snooze target for this month" switch, current month only (it saved:
  the API's `goal_snoozed_at` was set). A snoozed category loses its row note, its pill turns
  green or grey with a "zᶻ" mark (red stays red: O11), Underfunded leaves it out (the button fell
  by T8 E's $100.00) but still covers its overspending (O11 asked $30.00), Reduce Overfunding still
  takes back what's over (O9 $50.00), and October's Targets still counts it. Undo covers it.
- **Snoozed view**: the snoozed categories; empty: "You don't currently have categories with
  snoozed targets in this month."
- **Bars**: one section for the month (no target, snoozed, refill) or the target period (dated:
  T8 G 7% = $70 of $1,000; T8 F 33.3%); "Set aside another…" monthly and weekly targets put money
  carried in first in its own section (T8 N 60%/40% for $150 carried against $100; P1 44.4%/55.6%,
  its $50 spent from the first section); weekly targets one section per week (P2 $25: 100%, 100%,
  50%, empty, empty; P3: spent 100%, spent 50% + available 50%, available 100%) and an extra one
  for money beyond the weeks (O6 $70 against 5 × $10: an extra 28.6%). Otherwise the section grows
  to the money or spending (T8 L $150 against $100: full; O13 $130 spent of $100: 76.9% spent,
  23.1% overspent). Without a target the month is what was carried in plus assigned (L1: 62.5%
  spent, 37.5% overspent); an inflow that wasn't assigned isn't drawn (Q6, T8 J's refund).
- Colours: light = spent, dark = available, green when met, on track, snoozed or without a target,
  yellow while the target asks for more, red stripes for overspending, grey where nothing is.
  Payment categories have no bar.
- Notes: "Funded. Spent $30.00 of $100.00" (met, with spending), "Spent $7.00 of $20.00" and
  "Fully Spent" (no target), none without spending.
- The two toolbar icons switch bars on and off; off hides the bars and the notes too. The setting
  is this browser's (support.ynab.com).

### Details of 8d not seen in YNAB

- **Question:** (1) The note of a snoozed category with spending. (2) "Spent $x of $y" for a set
  aside target with money carried in: is $y only this month's money? (3) The "?" help text beside
  the snooze switch. (4) Settled in 8f: the switch shows in every month, disabled
  outside the current one. (5) Exact bar colours and thickness.
- **Built so far (before this rule):** (1) the no-target notes ("Spent …", "Fully Spent"); (2)
  carried plus assigned; (3) not built; (4) —; (5) Tailwind green/yellow/red,
  6px.


## Credit card payment targets (phase 8e)

Checked against support.ynab.com ("Paired Targets", "Underfunded Alert in the Credit Card Payment
Category") and in YNAB's web app and API on 2026-10-08. Test data added to the test plan: cards
Card E1 ($120 debt), Card E2 and Card E3 ($100 each), categories E-O1, E-F2 and E-O3 in the Test
group, transactions with memos `x-e1-over`, `x-e2-funded`, `x-e3-over` and `x-e2-pay` (a $20 payment
from Brac). E1's target was later saved with a past date, which removed it. Built as found:

- **The form**: "Create a Debt Payoff Target" (under the Underfunded or Overspent Categories alert,
  after "Don't have more money to assign?" / "Can't cover the overspent categories?") opens a type
  menu with "Pay Off Balance by Date" (the default) and "Pay Specific Amount Monthly", plus a
  "Making minimum payments?" help link. Pay off by date: a month (January–December) and a year
  (this year and the next 49), next month by default. Specific amount: one amount field. Delete,
  Cancel, Save Target. The API reports them as `TBD` (with `goal_target` 0) and `MF`. There's no
  snooze switch.
- **Pay Off Balance by Date** spreads what's still to pay off over the months left, counting both
  ends and rounding up: $120.00 by March 2027 asked $20.00 in October, $100.00 by December
  $33.34. What's left is what's owed beyond Available, with this month's Funded Spending left out
  of both: E2 with $10.00 of funded spending ($110.00 owed) still asked $33.34 ("Pay off $100.00",
  0%). Credit overspending raises what's owed at once: E1's $5.00 made it "Pay off $125.00",
  $20.84. A payment without money set aside changes nothing (E2: $90.00 owed, −$10.00 Available,
  still $100.00 to go). Money carried in counts in a future month (E1 with $50.00 assigned in
  October asked ($125.00 − $50.00) ÷ 5 = $15.00 in November; E2 after the payment ($90.00) ÷ 2 =
  $45.00).
- Its inspector: "Pay Off Balance by Date", "Pay off $125.00", "By Mar 2027", the ring (Available
  less funded spending against the same: E1 40% for $50.00 of $125.00), "Assign $20.84 this month
  to stay on track" with Assign, or "You're on track to meet your target!", then "Needed for
  Payoff" (what's owed), "Available for Payment" and "To Go".
- **Pay Specific Amount Monthly** asks like a monthly "Set aside another…": the amount every month
  whatever was carried, paid or spent (E3 $30.00 asked $30.00 again in November with $50.00
  carried in). Inspector: "Pay Specific Amount Monthly", "$30.00", "Each Month", "Assign $30.00 to
  meet your target", "Amount to Assign This Month / Assigned So Far / To Go".
- With a target that applies, the Target section takes the place of the Payment alert and Total
  Underfunded; Current Balance and Available for Payment stay. While the category is red (paid
  more than set aside) the alert shows instead ("You sent more to Card E2…", Total Underfunded
  $100.00 = $90.00 owed − (−$10.00)), and there's no Edit Target.
- The Available pill follows the target: yellow with a pie while it asks for more (E1, E3), green
  with a part-filled pie on track (E1, $50.00), green with a check when met (E3, $50.00), red when
  overpaid (E2). No note under payment rows, target or not.
- **Underfunded** asks what the target asks, not the balance: E1 $20.84, E2 (red) $33.34, E3 $30.00
  with $5.00 of credit overspending on it (the button fell by exactly these). **Reduce
  Overfunding** takes back Assigned above this month's ask: E3 $50.00 against $30.00 gave $20.00,
  E1 $50.00 against $20.84 gave $29.16. Card targets count in October's Targets (it rose by
  $84.18 = $20.84 + $33.34 + $30.00).
- With one payment category selected, Auto-Assign lists "Assigned Last Month", "Paid Last Month",
  "Average Assigned", "Average Paid" (amounts not checked).
- Saving a pay-off month before the current month left no target (API `goal_type` null; the
  inspector offered "Create a Debt Payoff Target" again).

### Details of 8e not seen in YNAB

- **Question:** (1) What a pay-off target shows in months after its month (April 2027 for E1's
  March) and in a month when Available covers the whole balance ("You've met your target!"?).
  (2) Whether a targeted payment category keeps its place last in Underfunded's funding order.
  (3) The Total Underfunded of a paid-off card that's red (owes nothing, −$10.00). (4) What
  "Paid Last Month" and "Average Paid" add up. (5) Whether the pill of a payment target is yellow
  in past months (spending targets are). (6) The help text behind "Making minimum payments?".
- **Built so far (before this rule):** (1) no target after its month; met reads "You've met your
  target!" as for other targets; a past month is refused when saving ("Choose this month or
  later"), since YNAB drops the target; (2) last, with the other card payments; (3) $0.00, as
  before; (4) the usual Spent Last Month / Average Spent amounts, relabelled; (5) the usual target
  colours in every month; (6) the link isn't built (everycent has no help center).

## Targets overview and history (phase 8f)

Checked against support.ynab.com ("Plan and Adjust with Edit Plan and Cost to Be Me") and in
YNAB's web app on 2026-10-08. Test data: category F-Y1 in the Test group (target changed several
times, now a monthly refill of $90.00 from October); the test plan's expected income is $2,000.00
(it can't be cleared). Built as found:

- **The overview** on the web is the summary's Cost to Be Me (built in 8c); YNAB has no per-group
  totals and no other overview, so none is built. "Next month's targets could increase your total
  to …" shows only when it's higher (help center). The help center says yearly and custom targets
  count there only when not due this month, but YNAB's numbers didn't follow it: F-Y1 as a yearly
  $120.00 due Oct 31 moved next month's total from $4,048.33 (as a monthly $120.00) to $3,938.33,
  i.e. it counted the new year's first share ($10.00), which is what everycent computes.
- **Expected Income**: "Enter your expected income" (nothing selected, current month) opens an
  "Expected Income" amount field with Cancel and Save. Once saved: "Expected Income $5,000.00" with
  a pencil ("Edit your income"), and a 4px bar under each line, scaled to the larger of the two:
  October's Targets blue (67.6% for $3,381.68 of $5,000.00), the income grey (100%); with $2,000.00
  the targets bar is red (a gradient) at 100% and the income bar 59.1%. No other message. It's kept
  from month to month (help center); November showed no Cost to Be Me at all. Saving 0 or an empty
  field left the amount as it was.
- **Target history**: YNAB keeps one target and no older versions. Changing a target (its type or
  amount) starts it in the month it's saved from: F-Y1 saved from September applied there; changed
  to $80.00 from October, September showed no target (API `goal_creation_month` 2026-10); changed
  to $90.00 from November, October showed none. Saving it unchanged from an earlier month moved the
  start back (October); unchanged from a later month (November) left it there. The form in a month
  before the start ("Create Target") opens filled with the existing target, with Delete.
- **Past and future months**: the inspector's target shows as in the current month, but in a past
  month the prompt has no Assign button ("Assign $120.00 to meet your target" only). The snooze
  switch shows in every month, disabled outside the current one ("You can only snooze targets in the
  current month."). Before a target's start month the category shows no target (API: no
  `goal_under_funded`).

### Details of 8f not seen in YNAB

- **Question:** (1) Whether a fresh start copies the expected income. (2) Whether changing only a
  target's snooze or due day counts as a change (only amount and type were seen). (3) Whether
  editing a target into a month that's snoozed keeps the snooze.
- **Built so far (before this rule):** (1) not copied; (2) any field of the target counts (the
  snooze isn't a field of it); (3) the snooze is kept.
