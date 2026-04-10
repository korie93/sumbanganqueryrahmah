import type { ImportRow } from "@/pages/import/types";

const importPreviewRowKeys = new WeakMap<ImportRow, string>();
let nextImportPreviewRowId = 1;

export function getImportPreviewRowKey(row: ImportRow): string {
  const existingKey = importPreviewRowKeys.get(row);
  if (existingKey) {
    return existingKey;
  }

  const nextKey = `import-preview-row-${nextImportPreviewRowId++}`;
  importPreviewRowKeys.set(row, nextKey);
  return nextKey;
}
