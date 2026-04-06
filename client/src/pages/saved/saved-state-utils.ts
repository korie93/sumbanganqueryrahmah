import type { ImportItem } from "@/pages/saved/types";

type SavedImportSummaryLabelOptions = {
  totalImports: number;
  visibleImportCount: number;
  hasMoreImports: boolean;
};

export function isSavedAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function mergeSavedImportPages(previous: ImportItem[], nextItems: ImportItem[]) {
  const deduped = new Map(previous.map((item) => [item.id, item]));
  for (const item of nextItems) {
    deduped.set(item.id, item);
  }
  return Array.from(deduped.values());
}

export function pruneSavedSelectedImportIds(previous: Set<string>, imports: ImportItem[]) {
  if (previous.size === 0) {
    return previous;
  }

  const validIds = new Set(imports.map((item) => item.id));
  let changed = false;
  const next = new Set<string>();

  for (const id of previous) {
    if (validIds.has(id)) {
      next.add(id);
      continue;
    }
    changed = true;
  }

  return changed ? next : previous;
}

export function toggleSavedImportSelection(previous: Set<string>, id: string, checked: boolean) {
  if (checked) {
    if (previous.has(id)) {
      return previous;
    }
    const next = new Set(previous);
    next.add(id);
    return next;
  }

  if (!previous.has(id)) {
    return previous;
  }

  const next = new Set(previous);
  next.delete(id);
  return next;
}

export function toggleSavedVisibleImportSelection(
  previous: Set<string>,
  imports: ImportItem[],
  checked: boolean,
) {
  const next = new Set(previous);
  for (const item of imports) {
    if (checked) {
      next.add(item.id);
      continue;
    }
    next.delete(item.id);
  }
  return next;
}

export function countSavedSelectedVisibleImports(imports: ImportItem[], selectedImportIds: Set<string>) {
  return imports.filter((item) => selectedImportIds.has(item.id)).length;
}

export function buildSavedImportSummaryLabel({
  totalImports,
  visibleImportCount,
  hasMoreImports,
}: SavedImportSummaryLabelOptions) {
  if (totalImports <= 0) {
    return "0 files";
  }

  if (hasMoreImports && visibleImportCount < totalImports) {
    return `${visibleImportCount} loaded of ${totalImports}`;
  }

  return `${totalImports} files`;
}
