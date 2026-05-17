export type CollectionReceiptDuplicateGroup = {
  key: string;
  fileName: string;
  size: number;
  indexes: number[];
};

function buildReceiptDuplicateKey(file: File): string {
  return `${String(file.name || "").trim().toLowerCase()}::${Math.max(0, Number(file.size) || 0)}`;
}

export function findDuplicateReceiptFiles(files: File[]): CollectionReceiptDuplicateGroup[] {
  const groups = new Map<string, CollectionReceiptDuplicateGroup>();

  files.forEach((file, index) => {
    const key = buildReceiptDuplicateKey(file);
    const existing = groups.get(key);
    if (existing) {
      existing.indexes.push(index);
      return;
    }

    groups.set(key, {
      key,
      fileName: file.name || "Unnamed receipt",
      size: Math.max(0, Number(file.size) || 0),
      indexes: [index],
    });
  });

  return Array.from(groups.values()).filter((group) => group.indexes.length > 1);
}

export function buildDuplicateReceiptSummary(groups: CollectionReceiptDuplicateGroup[]): string {
  if (groups.length === 0) {
    return "";
  }

  const duplicateCount = groups.reduce((total, group) => total + group.indexes.length, 0);
  const fileLabel = groups.length === 1 ? "receipt file" : "receipt files";
  return `${duplicateCount} pending uploads look duplicated across ${groups.length} ${fileLabel}.`;
}
