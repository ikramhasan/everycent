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
  account: { header: "Account", width: "8rem" },
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

/** The columns people act on in every row, kept in view at the register's right edge. */
const PINNED: readonly ColumnId[] = ["cleared", "actions"];

/**
 * Opaque stand-ins for the rows' see-through backgrounds (each the row's colour mixed onto the page
 * background), so cells scrolling underneath don't show through. Written out in full so Tailwind
 * finds the classes.
 */
export const PINNED_BG = {
  /** Transaction and split-line rows: plain, hovered, expanded (a split), selected, jumped to. */
  row: "bg-background [tr:hover>&]:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] [tr:has([aria-expanded=true])>&]:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] [tr[data-state=selected]>&]:bg-muted [tr[data-highlighted]>&]:animate-[row-highlight-pinned_2.5s_ease-out]",
  /** The inline editor's rows (`bg-muted/50`). */
  editor: "bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))]",
  /** Scheduled rows (`bg-muted/40`, `bg-primary/10` when selected). */
  scheduled:
    "bg-[color-mix(in_oklab,var(--muted)_40%,var(--background))] [tr[data-selected]>&]:bg-[color-mix(in_oklab,var(--primary)_10%,var(--background))]",
  /** Header cells are already opaque (`bg-muted`); they sit above the body's pinned cells. */
  head: "z-[2]",
};

/**
 * Pins Cleared and Actions to the right edge while the other columns scroll beneath them: sticky
 * at the summed width of the pinned columns after it, the first one with a divider on its left.
 * `null` for the scrolling columns.
 */
export function pinned(
  columns: readonly ColumnId[],
  id: ColumnId,
): { className: string; style: { right: string } } | null {
  if (!PINNED.includes(id)) return null;
  const visible = columns.filter((c) => PINNED.includes(c));
  const after = visible.slice(visible.indexOf(id) + 1);
  const right = `calc(0rem${after.map((c) => ` + ${COLUMN_SPECS[c].width}`).join("")})`;
  return {
    className: [
      "sticky z-[1]",
      visible[0] === id ? "shadow-[inset_1px_0_0_var(--border)]" : "",
    ].join(" "),
    style: { right },
  };
}

/** The pinned columns among these, left to right. */
export const pinnedColumns = (columns: readonly ColumnId[]) =>
  columns.filter((c) => PINNED.includes(c));

/** How wide the pinned columns are together, as CSS. */
export const pinnedWidth = (columns: readonly ColumnId[]) =>
  `calc(0rem${pinnedColumns(columns)
    .map((c) => ` + ${COLUMN_SPECS[c].width}`)
    .join("")})`;
