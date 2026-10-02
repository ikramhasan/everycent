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
