# Verify against YNAB

How YNAB behaves in cases we couldn't confirm from its help center. Each entry is skipped in the
app until it's settled here (see "Matching YNAB" in `CLAUDE.md`). Check each one in YNAB, write
down the answer, and a later session builds it and removes the entry.

Entries marked **Built so far (before this rule)** are small gaps inside a feature that was
otherwise confirmed in YNAB (web app, 2026-10-02); the app needed some behaviour to work at all,
so it has one. Change it if YNAB differs.

## Register search (phase 5e, rebuilt to YNAB's search syntax)

### How a picked "equals" amount or a date reads in the search box

- **Question:** picking "Outflow more or equal to $25.00" writes `Outflow: >=25,`. What does
  "Outflow equals $25.00" write (`Outflow: 25`? `Outflow: =25`?), and what do "On 10/02/2026",
  "On or before …" and "On or after …" write?
- **Built so far (before this rule):** `Outflow: 25`, `On: 10/02/2026`, `Before: …`, `After: …`.
  The search accepts `25` and `=25` both.

### What "Find … in any field" searches

- **Question:** free text (and "Find "x" in any field") matched payee, category and memo in YNAB,
  and a number matched an exact amount. Does it also match the account name?
- **Built so far (before this rule):** payee, category, memo, account name, and exact amounts.

### The hidden-rows note when both a search and a filter hide rows

- **Question:** YNAB says "Some transactions are hidden by your search for "…"" or "Some
  transactions are hidden by filters." Which does it show when both a search and the date range
  (or hidden reconciled transactions) hide rows?
- **Built so far (before this rule):** the search message.

## View menu (phase 5e)

### Where view options are kept

- **Question:** YNAB keeps the View menu's options per account (and for All Accounts). Are they
  saved to the account (the same on another browser or device) or only in this browser?
- **Built so far (before this rule):** this browser (`localStorage`).

### The From/To pickers on All Dates

- **Question:** with All Dates, YNAB's pickers showed October 2026 to October 2036 in a budget
  whose transactions were all in October 2026. Is "From" the month of the oldest transaction, or
  the current month?
- **Built so far (before this rule):** the current month to ten years on.

## Bulk edit (phase 5f)

### Un-split dialog when every selected split has a transfer line

- **Found:** YNAB asks before un-splitting ("Un-split and Categorize Split Transaction(s)?"). One
  split with a transfer line alone got no dialog (its other lines were categorized silently).
- **Question:** with two or more splits selected that all have transfer lines (nothing to
  un-split), is there a dialog?
- **Built so far (before this rule):** no dialog unless some selected split will be un-split.

### Moving a split into an account one of its transfer lines goes to

- **Question:** bulk Move to Account with a split whose transfer line points at the target account
  (the line would transfer to its own account). Does YNAB skip the split, drop the line's
  transfer, or refuse?
- **Built so far (before this rule):** skipped, like a transfer moved into its own other account.

### Move or delete when a transfer's other side is reconciled

- **Question:** bulk Move or Delete with a transfer whose other side is reconciled. Skip, unlock,
  or refuse?
- **Built so far (before this rule):** the whole action is refused (409 `TRANSFER_RECONCILED`), as
  a single edit is.

### "Move to Account" in All Accounts

- **Found:** in an account's register the submenu lists the budget's other accounts.
- **Question:** what does it list in All Accounts (every account? closed ones?)
- **Built so far (before this rule):** every open account.

### The Clear button when every selected row is cleared

- **Found:** a selection of uncleared rows shows "Clear"; mixed states move "Mark as Cleared" /
  "Mark as Uncleared" into More.
- **Question:** with only cleared rows selected, does "Clear" mark them uncleared?
- **Built so far (before this rule):** yes, it toggles them to uncleared.

## Budget screen (phase 6a)

Checked in YNAB's web app on 2026-10-02 and built as found: Activity leaves out future-dated
transactions (YNAB makes them scheduled transactions); hidden categories count in a "Hidden
Categories" row at the bottom, not in their group's totals; an "Uncategorized Transactions" row
shows only in months with uncategorized transactions; a negative Available starts the next month at
zero; months run from the one before the oldest transaction to the one after the current month (or
after the latest month with money assigned, which stays open even after an undo; a new empty plan
runs from the month before the current one); group collapse survives a reload and applies to every
month.

### Where collapsed groups are kept

- **Question:** YNAB keeps a collapsed group collapsed after a reload. Is that saved to the budget
  or account (the same on another device or for a partner) or only in this browser?
- **Built so far (before this rule):** this browser (`localStorage`, per budget).

### Which month the budget screen opens on

- **Found:** going from an account back to Plan opened the month last viewed (November), not the
  current month; YNAB's URL holds the month (`/budget/202611`).
- **Question:** does it also reopen the last month after a reload, or on another device?
- **Skipped:** the budget screen always opens on the current month; `?month=` holds the month
  while browsing.

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

### The wording of a negative Ready to Assign

- **Found:** November (after the current month) said "You assigned more than you have" with a
  "Fix This" button; September (before it, negative from August's overspending, with or without
  money assigned in it) said "Overdraft? We can help with that!" with "Next Steps" (a help page).
- **Question:** what decides the wording: past month vs current/future, or where the shortfall
  comes from? What does the current month say when it's negative?
- **Built so far (before this rule):** months before the current one say "Overdraft?", the rest
  "You assigned more than you have". The buttons aren't built (Fix This moves money: phase 6c).

### Where "Assigned in Future Months" shows

- **Found:** the panel (total, then each later month; the next month at $0.00 when nothing is
  assigned) showed in October, the current month. It wasn't in September's or November's sidebar.
- **Question:** is it only ever shown in the current month, or in any month with money assigned
  after it?
- **Built so far (before this rule):** the current month only.

### The setup flow's "Fund categories" step

- **Found:** "Create New Plan" in an existing YNAB account opens the plan straight away, with no
  onboarding; the guided setup only runs for a new account, so it couldn't be checked.
- **Question:** what does YNAB's onboarding ask in its funding step (assign to each chosen
  category, a suggested split, or just a pointer to the budget screen)?
- **Skipped:** the setup flow still ends after "Add accounts".

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

### Moving more than a category has

- **Question:** can the Move field take more than the category has available (leaving it
  negative), or is it capped or refused?
- **Built so far (before this rule):** any positive amount moves; the category can go negative.

### Deleting a category that has assigned money but no transactions

- **Found (help center):** deleting a category reassigns its transactions, assigned amounts and
  available money to the category you pick.
- **Question:** is the reassign question also asked when the category has money but no
  transactions? If not, where does the money go?
- **Built so far (before this rule):** only categories with transactions ask; the money of one
  without transactions returns to Ready to Assign.

### How far back Recent Moves goes, and whose moves it shows

- **Question:** how many moves (or days) does Recent Moves keep, and on a shared budget does it
  show who made each move?
- **Built so far (before this rule):** the latest 100 moves; the API returns who moved it, the
  list doesn't show it.

### The month in "Fix This"

- **Found:** the first time it opened, "Un-assign money from" had a month picker ("Nov 2026")
  next to the label; later it didn't.
- **Question:** when does Fix This offer another month, and which months?
- **Built so far (before this rule):** money is un-assigned in the month on screen.

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

### Where the budget view is kept

- **Question:** the view survives a reload. Is it saved to the account or only in this browser?
- **Built so far (before this rule):** this browser (`localStorage`, per budget), like collapsed
  groups.

### Group totals in a view

- **Question:** under Overspent, does a group's row total the whole group or only the categories
  in view? (The test plan's groups had one category each in view, so the numbers matched.)
- **Built so far (before this rule):** the whole group's totals.

### A tracking account's starting balance in a group's Activity

- **Found:** Bills' Activity was −$25.00, but its popover also listed "House, Starting Balance,
  +$500.00" (a tracking account, "Category not needed"), which the total doesn't count.
- **Question:** is that a YNAB bug, or does the group popover list something we don't model?
- **Built so far (before this rule):** the popover lists exactly what the Activity adds up.

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

### Rounding of averages

- **Question:** how does YNAB round an average that doesn't come out to the cent ($1.00 over 3
  months)?
- **Built so far (before this rule):** half-even to the minor unit.

### The banner's Assign menu

- **Found (help center):** the Ready to Assign banner's "Assign" button opens a pop-up with the
  same options under an "Auto" tab.
- **Skipped:** not built; the inspector has every option. Its other tabs weren't checked.

### Reset Assigned on the whole plan

- **Found (help center):** with nothing selected, "there's a prompt to confirm that decision".
- **Built so far (before this rule):** the same preview every option gets, which needs a click on
  "Update Assigned Amounts".

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
  will be deducted" quoted only the cash part (Available −$3.00). everycent still quotes all of
  it until credit overspending (7c) stops deducting the credit part.

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
- **Still provisional:** two equal purchases on the same day fund the newest card first (fits the
  three 2026-10-03 cases: Medical, Emergency fund, Dining out); a refill goes to the earliest
  unfunded purchase first, which only changes how the payment categories' "Overspent Categories"
  line splits between cards (not checked in YNAB).
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

### Payment category messages and the next month

- **Found:** in October, Visa said "Overspent Categories — Cover $29.00 in overspent categories in
  order to pay off your current balance" with "Cover Overspent Categories" and "Create a Debt
  Payoff Target"; November said "Underfunded — You need to assign $29.00 more to pay off your
  current balance." Card A (with old debt as well) listed both lines under Total Underfunded.
- **Question:** what does the payment category say when both apply, what does "Cover Overspent
  Categories" do (one click, or a picker?), and is the pill yellow in past months (the help center
  says previous months show green)?
- **Built so far (before this rule):** the pill is yellow when Available is below what's owed in
  the current month and later, green before it. The inspector lists Total Underfunded with its two
  parts, Current Balance and Available for Payment; the "Cover Overspent Categories" button isn't
  built. "Create a Debt Payoff Target" came with 8e ("Credit card payment targets" below).

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
confirming every delta by delete and re-add; dialogs and colours in the web app. Not built yet;
7e builds it.

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
  and buttons, no info box. A $0 card (Card K) closed straight away with no dialog and no
  adjustment.
- The payment category keeps its money and stays visible; nothing goes back to Ready to Assign:
  Card Y kept $6 set aside (green, "Your Card Y is paid off! Being debt free is a wonderful
  thing."), Card K kept $5, Card P stayed at −$10 (red, deducted next month).
- Card Y's inspector after closing showed Prior Balance −$21.00 (the starting balance) and
  Payments and Inflows $21.00 (the $1 payment and the $20 adjustment).

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

### Percentage rounding

- **Question:** whether the ring rounds or truncates (e.g. $99.99 of $100.00: 99% or 100%).
  Assigning $99.99 to T8 A didn't stick in the web app and the API was rate-limited.
- **Built so far (before this rule):** rounded down, so the ring never reads 100% before the target
  is met.

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

### Details of 8b not seen in YNAB

- **Question:** (1) Does spending during the month change what a refill or balance target with a
  date asks (its Funded/Current Balance)? (2) For set aside, does money assigned before the
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
