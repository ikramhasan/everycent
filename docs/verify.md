# Verify against YNAB

How YNAB behaves in cases we couldn't confirm from its help center. Each entry is skipped in the
app until it's settled here (see "Matching YNAB" in `CLAUDE.md`). Check each one in YNAB, write
down the answer, and a later session builds it and removes the entry.

## Register (phase 5)

### Bulk categorize with a split in the selection (5f)

- **Question:** selecting a split together with other transactions and choosing Categorize: does
  YNAB un-split it, set every line to that category, skip it, or refuse?
- **Found:** YNAB's web action bar offers Categorize on a selection, and bulk categorize can't be
  used on credit card payments
  ([How to Edit and Delete Transactions](https://support.ynab.com/en_us/how-to-edit-and-delete-transactions-BJG4oS1s)).
  Nothing about splits.
- **Options:** un-split (loses lines and their transfers); set every line's category (keeps the
  lines); skip splits and say how many; ask each time.
- **Waiting on it:** bulk Categorize refuses a selection that includes a split (nothing changes;
  the message says how many to unselect). Transfers within the budget and tracking-account rows
  are refused too, since a single edit can't give them a category either.

### Bulk move or delete with transfers and split transfer lines in the selection (5f)

- **Question:** when a selection includes one side of a transfer, or the other side of a split's
  transfer line, what do bulk Move to Account and Delete do? Move/delete the pair together, skip
  those rows, or refuse?
- **Found:** single-transaction rules only: a transfer shows in both accounts
  ([Transfer Transactions](https://support.ynab.com/en_us/transfer-transactions-a-guide-HJOsZz4Jj)).
  Nothing on bulk.
- **Waiting on it:** bulk Move to Account and bulk Delete aren't built yet.

### Bulk delete: confirm or undo (5f)

- **Question:** the web help says Delete is under More and offers Undo until you refresh; the
  mobile apps ask to confirm. Does web bulk delete (many rows) also go straight to Undo with no
  confirmation?
- **Found:** [How to Edit and Delete Transactions](https://support.ynab.com/en_us/how-to-edit-and-delete-transactions-BJG4oS1s)
  (single delete on web: no confirmation, Undo button).
- **Waiting on it:** bulk Delete isn't built yet (with the entry above).

### Bulk mark cleared/uncleared with reconciled transactions selected (5f)

- **Question:** does YNAB's bulk Mark as Cleared/Uncleared skip reconciled transactions, unlock
  them, or refuse?
- **Waiting on it:** the bulk action refuses a selection with reconciled rows.

### Bulk memo: replace or add (5f)

- **Question:** YNAB's web action bar can set a memo on many transactions. Does it replace each
  memo, add to it, or fill only empty ones? Does it ask first when some already have memos?
- **Found:** "it is possible to bulk edit memos in the web app"
  ([How to Edit and Delete Transactions](https://support.ynab.com/en_us/how-to-edit-and-delete-transactions-BJG4oS1s)).
  Nothing on how.
- **Waiting on it:** bulk Memo isn't built.

### Running balance while filtered (5e)

- **Question:** with a search or filter on, does YNAB show each row's real account balance,
  hide the balance column, or show a total of only the matching rows?
- **Found:** [Searching, Sorting, and Filtering Transactions](https://support.ynab.com/en_us/searching-transactions-a-guide-r1gxyQryj)
  wasn't read for this.
- **Built so far (before this rule):** each row keeps the real account balance, with a note above
  the table. Change it if YNAB differs.

### Register's default date range (5e)

- **Question:** what date range does a YNAB register open with (all dates, this year, …)?
- **Built so far (before this rule):** all dates. Change it if YNAB differs.

### Hiding the running balance when sorted by another column (5e)

- **Question:** does YNAB hide the running balance (or the column) when you sort by payee,
  amount and so on?
- **Built so far (before this rule):** the balance column hides unless sorted by date. The code
  comment calling this YNAB's behaviour was an assumption.
