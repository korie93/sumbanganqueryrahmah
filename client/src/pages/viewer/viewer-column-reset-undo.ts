import { resolveViewerPinnedColumn } from "./viewer-pinned-column";

export type ViewerColumnResetUndoSnapshot = {
  order: string[];
  visible: string[];
  pinnedColumn: string | null;
};

/** Restore only a complete layout for the same exact imported fields. */
export function restoreViewerColumnResetUndo(
  snapshot: ViewerColumnResetUndoSnapshot,
  headers: readonly string[],
): ViewerColumnResetUndoSnapshot | null {
  const allowed = new Set(headers);
  if (
    headers.length === 0
    || allowed.size !== headers.length
    || snapshot.order.length !== headers.length
    || new Set(snapshot.order).size !== snapshot.order.length
    || snapshot.order.some((column) => !allowed.has(column))
    || snapshot.visible.length === 0
    || new Set(snapshot.visible).size !== snapshot.visible.length
    || snapshot.visible.some((column) => !allowed.has(column))
    || (snapshot.pinnedColumn !== null
      && resolveViewerPinnedColumn(snapshot.pinnedColumn, snapshot.visible) !== snapshot.pinnedColumn)
  ) {
    return null;
  }

  return {
    order: [...snapshot.order],
    visible: [...snapshot.visible],
    pinnedColumn: snapshot.pinnedColumn,
  };
}

/** Keep one independent pre-reset layout; resetting the default layout needs no undo. */
export function createViewerColumnResetUndo(
  headers: readonly string[],
  order: readonly string[],
  selected: ReadonlySet<string>,
  pinnedColumn: string | null | undefined,
): ViewerColumnResetUndoSnapshot | null {
  const snapshot = restoreViewerColumnResetUndo({
    order: [...order],
    visible: order.filter((column) => selected.has(column)),
    pinnedColumn: pinnedColumn ?? null,
  }, headers);

  if (
    snapshot === null
    || snapshot.visible.length !== selected.size
    || (snapshot.pinnedColumn === null
      && snapshot.visible.length === headers.length
      && snapshot.order.every((column, index) => column === headers[index]))
  ) {
    return null;
  }

  return snapshot;
}
