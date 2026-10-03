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
  labels when one category is selected. Underfunded and Reduce Overfunding need targets (phase 8).
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

### Several cards competing for one category's money

- **Found:** with $5 assigned and two −$4 card purchases on the same day, one card got $4 and the
  other $1, but not by entry order or sidebar order: Medical (Visa then Amex) and Emergency fund
  (Amex then Visa) both gave Amex $4; Dining out (Citi then Amex) gave Citi $4.
- **Question:** how does YNAB split a category's money between cards when it can't fund them all
  (transaction date, account creation, transaction id …)? This is also 7c's "which payment method
  is funded first" gate.
- **Built so far (before this rule):** the newest card (latest-created account) is funded first,
  which fits all three cases seen (`fundedCardSpending` in `packages/engine/src/credit.ts`).
- **How to settle it:** two new cards (Card A then Card B, each starting at $100 owed), $5
  assigned to a new category, then Card A −$4 dated 10/02 and Card B −$3 dated 10/01, entered in
  that order; reload twice and read both payment categories' Available. Repeat with the purchases
  swapped between the cards. A 4/1 split means a whole purchase was funded first; anything like
  2.86/2.14 means a proportional split.

### Returns on one card, spending on another, in the same category

- **Found:** results didn't follow a single model, and the payment categories' numbers changed
  after a page reload (Visa Funded Spending $35.00 live, $38.00–$39.00 after reloads with nothing
  edited in between). Examples after reload: T2 ($0; Amex +$5, Visa −$3) ended Available $2.00;
  T3 and T4 ($0; Amex +$3, Visa −$3) ended $0.00; Amex's Payments & Returns was $10.00 against
  $22.00 of categorized Amex returns.
- **Question:** does a return on one card fund spending on another card in the same category,
  and how much leaves the returning card's payment category?
- **Built so far (before this rule):** card returns go back into the category's money and can fund
  another card's spending there; each returning card's payment category gives up its whole return.
  This matched the categories' Available in every case (T2 $2.00, T3/T4 $0.00) but not every
  payment category's number, which YNAB itself changed between reloads.
- **How to settle it:** with the two new cards above (balances below zero throughout), a category
  with $0 assigned: Card A +$5 dated 10/01, Card B −$3 dated 10/02; reload twice and read both
  payment categories and the category. Then the same with the dates swapped.

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
  parts, Current Balance and Available for Payment; the "Cover Overspent Categories" button and the
  Debt Payoff Target (phase 8) aren't built.

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
- A transfer out of a card to a budget account (a cash advance, Visa → Wallet $1.00) has no
  category: it raised Ready to Assign by nothing and left Visa's payment category alone — but it
  raised the card's debt (Spending −$69.00) with no money set aside for it, so the payment category
  is $1.00 more underfunded. (Ready to Assign moved $11,997.00 → $11,998.00 here; that was the
  undone R4 money in November, not the advance.)

### A refund larger than what was funded, and refunds in a later month

- **Question:** R4 had $5 of unfunded credit spending and a $5 refund on the same card in the same
  month; the category went to $0 and Citi didn't change (netting, 7b). A refund in a later month
  than the purchase, or one larger than the month's purchases, would take money out of the
  payment category in the refund's month (support.ynab.com) — not checked in the app.
- **Built so far (before this rule):** the refund's month and the card's net activity in that
  month decide it, as 7b computes (a later-month refund moves its whole amount out).

### Payment from a tracking account, and payments into a positive card

- **Question:** a "payment" from an off-budget account (the transfer gets a category on the
  budget side, phase 5 rules) and paying a card that's already positive (7e).
- **Skipped:** a transfer into a card from a tracking account moves no payment money here; a
  positive card balance is phase 7e.

## Credit lifecycle (phase 7e)

Checked against support.ynab.com ("Credit Cards with a Positive Balance", "How to Close or Delete
Bank Accounts", "Correcting Balances in Closed Accounts", "Changing an Account Type", "Line of
Credit Accounts") and in YNAB on 2026-10-03, through the web app and the API (test cards P–Y,
lines of credit LOC A/B, categories Q2–Q6, R3, L1–L3). Not built yet; 7e builds it:

- A card above zero counts as cash. The part above zero is in Ready to Assign ("Inflow from Debt
  Account" in its breakdown): a $10 overpayment of a $0 card raised it by $10 and left the payment
  category at −$10, red (cash overspending, deducted next month).
- What decides it is the card's balance on each transaction's date. Spending while positive moves
  nothing to the payment category, and unfunded spending is cash overspending (red): Q2 −$4 on
  Card Q at +$10. Spending that crosses zero splits: Q3 ($10 assigned) −$10 on Card Q at +$6 was
  Cash Spending −$6 and Credit Spending −$4, with Funded Spending $4. Spending dated before the
  overpayment stays credit (Q4/Card R, Q5/Card S, R3/Card U: yellow, nothing deducted).
- A refund to a $0 card goes to its category and leaves the payment category alone (Q6/Card T).
- A statement credit counts toward Ready to Assign only for the part above zero: $8 on Card V at
  −$5 raised it by $3.
- Closing makes a Manual Balance Adjustment categorized to Inflow: Ready to Assign, and the
  payment category stays visible (the help center says to hide it yourself). Card P at +$10: the
  dialog says the money "will be removed from your plan", and Ready to Assign fell by $10. Card Y
  owing $21 with $7 set aside: the dialog only says an adjustment of $21.00 will be created; Ready
  to Assign didn't change and the payment category kept its $7.
- Account types can't be changed (the Edit Account dialog has no type field); YNAB says to
  create a new account and move the transactions.
- A line of credit behaves as a credit card: its own payment category, funded spending moves
  (L1 $5 assigned, −$8 on LOC A: $5 moved, −$3 credit overspending not deducted next month),
  payments come out of it, and a positive balance is cash (LOC B +$10: Ready to Assign +$10; L2's
  −$4 on it was cash overspending, deducted next month).
- Card transactions categorized to Inflow: Ready to Assign (statement credits, outflows,
  starting balances and the closing adjustment) change Ready to Assign only by how much they move
  the card's balance above zero: $8 in on Card V at −$5 → +$3; $5 out on Card V at +$3 → −$3;
  $2 out on Card W at −$5 → nothing. Closing follows the same rule (Card P +$10 → −$10, Card Y
  owing $21 → nothing), so it needs no rule of its own.
- A paid-off card's payment category says "Your Card T is paid off! Being debt free is a
  wonderful thing." (Card T, +$5.)
- In the API a credit starting balance and the closing adjustment both report category
  "Inflow: Ready to Assign"; the register shows "Category not needed" for the starting balance.

### Unreliable API readings, and the cases they leave open

- **Found:** reading `GET /months` right after a write can return stale numbers. Creating
  "t-uncat" (−$2 uncategorized on Card T at +$5) and "r-uncat" (−$1 on Card R at +$4) showed no
  change in November's Ready to Assign. Deleting and re-adding the same transactions, with a few
  seconds' wait, moved November by $2 and $1 each time. So readings taken straight after a write
  (the bullets above marked "API": statement credit out on Cards V/W, lines of credit, Card X,
  Card Y's close) need re-checking with a wait. The web-app readings (Cards P, Q, R, S, T, U, V)
  stand.
- **Still open (each needs a fresh, uncluttered test plan):**
  - Uncategorized spending on a positive card: cash (deducted next month, as the re-add showed)
    or credit?
  - Spending on the same day as the payment that made the card positive: L5 −$4 on Card Z2 (paid
    $10 that day) took $4 off October's Ready to Assign. Q2 on Card Q (paid two days before) took
    nothing off October and $4 off November. Why the difference: same day, or something else?
  - Spending that crosses zero after uncategorized spending: z1-l4 (Card Z1 at +$1, −$3 in L4)
    was deducted $1, as expected, but removing z1-uncat (−$4) moved November by only $1, not $4.
  - A cash advance from a positive card: Card Z3 at +$6 moving $8 to Wallet raised Ready to
    Assign by $2.
- **Skipped until then:** anything beyond the web-app findings: a positive balance from a
  payment goes to Ready to Assign; categorized spending dated after the payment is cash; spending
  that crosses zero splits into cash and credit; closing creates an adjustment to Ready to
  Assign and leaves the payment category visible.

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
  October). Saving it from an earlier month moves its start back to that month; saving from a later
  month leaves the start alone. Editing changes every month from the start on.
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
