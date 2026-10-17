import { useCallback, useState } from "react";

export type ColumnId =
  | "select"
  | "review"
  | "flag"
  | "attachment"
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
  attachment: { header: "Attachment", width: "2.75rem", align: "center", srOnly: true },
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
    // YNAB's photo column, right after the flag (EVERYCENT-31; photos and PDFs here).
    "attachment",
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

/**
 * Columns whose width can be dragged, as YNAB's can (2026-10-18). Memo takes what's left, so it
 * grows and shrinks as the others are dragged; the icon columns stay as they are.
 */
export const RESIZABLE: readonly ColumnId[] = [
  "account",
  "date",
  "payee",
  "category",
  "outflow",
  "inflow",
  "balance",
];
/** YNAB lets a column shrink to about 30px. */
export const MIN_COLUMN_PX = 30;

export type ColumnWidths = Partial<Record<ColumnId, number>>;

/** A column's CSS width: the one dragged to, else its default. */
export function columnWidth(widths: ColumnWidths, id: ColumnId): string | undefined {
  const dragged = widths[id];
  return dragged === undefined ? COLUMN_SPECS[id].width : `${dragged}px`;
}

/** Dragged widths per register (an account's, or All Accounts'), kept in this browser as YNAB's are. */
export function useColumnWidths(register: string) {
  const key = `everycent:register-columns:${register}`;
  const [widths, setWidths] = useState<ColumnWidths>(() => readWidths(key));
  const [loadedKey, setLoadedKey] = useState(key);
  if (loadedKey !== key) {
    setLoadedKey(key);
    setWidths(readWidths(key));
  }
  const setWidth = useCallback(
    (id: ColumnId, px: number) =>
      setWidths((current) => {
        const next = { ...current, [id]: Math.max(MIN_COLUMN_PX, Math.round(px)) };
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage can be unavailable (private windows); the width still holds for this visit.
        }
        return next;
      }),
    [key],
  );
  return { widths, setWidth };
}

function readWidths(key: string): ColumnWidths {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([id, px]) =>
          RESIZABLE.includes(id as ColumnId) && typeof px === "number" && px >= MIN_COLUMN_PX,
      ),
    );
  } catch {
    return {};
  }
}
