export type ColumnId =
  | "account"
  | "date"
  | "payee"
  | "category"
  | "memo"
  | "outflow"
  | "inflow"
  | "balance"
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
  account: { header: "Account", width: "9rem" },
  date: { header: "Date", width: "9.25rem" },
  payee: { header: "Payee", width: "12rem" },
  category: { header: "Category", width: "13rem" },
  memo: { header: "Memo" },
  outflow: { header: "Outflow", width: "7.5rem", align: "right" },
  inflow: { header: "Inflow", width: "7.5rem", align: "right" },
  balance: { header: "Balance", width: "7.5rem", align: "right" },
  cleared: { header: "Cleared", width: "2.75rem", align: "center", srOnly: true },
  actions: { header: "Actions", width: "2.75rem", srOnly: true },
};

/** All-accounts view adds the account and drops the running balance (YNAB does the same). */
export function registerColumns(allAccounts: boolean): ColumnId[] {
  return [
    ...(allAccounts ? (["account"] as const) : []),
    "date",
    "payee",
    "category",
    "memo",
    "outflow",
    "inflow",
    ...(allAccounts ? [] : (["balance"] as const)),
    "cleared",
    "actions",
  ];
}

export function isEditable(column: ColumnId): column is EditableColumn {
  return ["account", "date", "payee", "category", "memo", "outflow", "inflow"].includes(column);
}
