/** Local header lookup: preserve each exact header and its original option identity. */
export function findViewerFilterColumns(headers: readonly string[], query: string) {
  const search = query.trim().toLowerCase();
  return headers.map((header, index) => ({ header, index }))
    .filter(({ header }) => search === "" || header.toLowerCase().includes(search));
}

/** Keyboard navigation over visible results; null leaves text-editing keys alone. */
export function moveViewerFilterColumnIndex(current: number, count: number, key: string): number | null {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) return null;
  if (count <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const index = Math.max(0, Math.min(current, count - 1));
  return (index + (key === "ArrowDown" ? 1 : -1) + count) % count;
}
