/**
 * The register's selection: rows ticked one by one, or "all matching the filter" (including rows
 * not loaded yet) minus the ones unticked after.
 */
export type Selection =
  | { mode: "some"; ids: ReadonlySet<string> }
  | { mode: "all"; except: ReadonlySet<string> };

export const NOTHING: Selection = { mode: "some", ids: new Set() };

export function isSelected(selection: Selection, id: string) {
  return selection.mode === "some" ? selection.ids.has(id) : !selection.except.has(id);
}

export function isEmpty(selection: Selection) {
  return selection.mode === "some" && selection.ids.size === 0;
}

/** Ticks or unticks `ids` (one row, or a shift-click range). */
export function setSelected(selection: Selection, ids: readonly string[], on: boolean): Selection {
  if (selection.mode === "some") {
    const next = new Set(selection.ids);
    for (const id of ids) on ? next.add(id) : next.delete(id);
    return { mode: "some", ids: next };
  }
  const except = new Set(selection.except);
  for (const id of ids) on ? except.delete(id) : except.add(id);
  return { mode: "all", except };
}

/**
 * The rows from the last ticked one to `id`, in register order, for shift-click. Just `id` when
 * there's no anchor or it's no longer loaded.
 */
export function rangeTo(order: readonly string[], anchor: string | null, id: string) {
  const to = order.indexOf(id);
  const from = anchor === null ? -1 : order.indexOf(anchor);
  if (from === -1 || to === -1) return [id];
  return order.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** What the API takes; `filter` is the register's current filter. */
export function selectionBody<F>(selection: Selection, filter: F) {
  return selection.mode === "some"
    ? { ids: [...selection.ids] }
    : { filter, exclude: [...selection.except] };
}
