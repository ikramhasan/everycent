export type ColumnId =
  | "select"
  | "review"
  | "flag"
  | "account"
  | "date"
  | "payee"
  | "category"
  | "memo"
  | "outflow"
  | "inflow"
  | "balance"
  | "enteredBy"
  | "cleared"
  | "actions";

/** Fields that can be edited in place, in Tab order. */
export type EditableColumn = Extract<
  ColumnId,
  "account" | "date" | "payee" | "category" | "memo" | "outflow" | "inflow"
>;

interface ColumnSpec {
  header: string;
  /** Fixed width; the memo column takes what's left. */
  width?: string;
  align?: "right" | "center";
  /** Header read by screen readers only. */
  srOnly?: boolean;
}

export const COLUMN_SPECS: Record<ColumnId, ColumnSpec> = {
  select: { header: "Select", width: "2.25rem", align: "center", srOnly: true },
  review: { header: "Approval", width: "2.25rem", align: "center", srOnly: true },
  flag: { header: "Flag", width: "2.5rem", align: "center", srOnly: true },
  account: { header: "Account", width: "9rem" },
  // Room for the date editor: the date plus its calendar button.
  date: { header: "Date", width: "8.75rem" },
  payee: { header: "Payee", width: "11.5rem" },
  category: { header: "Category", width: "12.5rem" },
  memo: { header: "Memo" },
  // Fits "$100,000.00" with the cell padding.
  outflow: { header: "Outflow", width: "6.5rem", align: "right" },
  inflow: { header: "Inflow", width: "6.5rem", align: "right" },
  balance: { header: "Balance", width: "6.5rem", align: "right" },
  enteredBy: { header: "Entered by", width: "2.75rem", align: "center", srOnly: true },
  cleared: { header: "Cleared", width: "2.75rem", align: "center", srOnly: true },
  actions: { header: "Actions", width: "2.75rem", srOnly: true },
};

/**
 * All-accounts view adds the account and drops the running balance (YNAB does the same). The flag
 * comes first, before the date, as in YNAB.
 */
export function registerColumns(allAccounts: boolean): ColumnId[] {
  return [
    "select",
    // YNAB's info column; the register shows it only while a row needs approval or a category.
    "review",
    "flag",
    ...(allAccounts ? (["account"] as const) : []),
    "date",
    "payee",
    "category",
    "memo",
    "outflow",
    "inflow",
    ...(allAccounts ? [] : (["balance"] as const)),
    // An everycent extra (EVERYCENT-89), off unless the View menu turns it on.
    "enteredBy",
    "cleared",
    "actions",
  ];
}

export function isEditable(column: ColumnId): column is EditableColumn {
  return ["account", "date", "payee", "category", "memo", "outflow", "inflow"].includes(column);
}
