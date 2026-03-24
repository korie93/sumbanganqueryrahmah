export type CollectionReceiptPanelSummary = {
  existingCount: number;
  keptExistingCount: number;
  removedExistingCount: number;
  pendingCount: number;
  willReplace: boolean;
  message: string;
};

function formatReceiptCountLabel(count: number) {
  const safeCount = Math.max(0, Number(count) || 0);
  return `${safeCount} ${safeCount === 1 ? "receipt" : "receipts"}`;
}

export function buildCollectionReceiptPanelSummary(params: {
  existingCount?: number;
  removedExistingCount?: number;
  pendingCount?: number;
}): CollectionReceiptPanelSummary {
  const existingCount = Math.max(0, Number(params.existingCount) || 0);
  const removedExistingCount = Math.min(
    existingCount,
    Math.max(0, Number(params.removedExistingCount) || 0),
  );
  const keptExistingCount = Math.max(0, existingCount - removedExistingCount);
  const pendingCount = Math.max(0, Number(params.pendingCount) || 0);
  const willReplace = removedExistingCount > 0 && pendingCount > 0;

  let message = "No receipt selected yet.";
  if (keptExistingCount > 0 || removedExistingCount > 0 || pendingCount > 0) {
    const parts: string[] = [];

    if (keptExistingCount > 0) {
      parts.push(`${formatReceiptCountLabel(keptExistingCount)} currently linked`);
    }
    if (removedExistingCount > 0) {
      parts.push(`${formatReceiptCountLabel(removedExistingCount)} marked for removal`);
    }
    if (pendingCount > 0) {
      parts.push(`${formatReceiptCountLabel(pendingCount)} pending upload`);
    }

    message = `${parts.join(" | ")}. Changes apply only after save.`;
    if (willReplace && keptExistingCount === 0) {
      message = `${formatReceiptCountLabel(removedExistingCount)} will be replaced by ${formatReceiptCountLabel(pendingCount)} on save.`;
    }
  }

  return {
    existingCount,
    keptExistingCount,
    removedExistingCount,
    pendingCount,
    willReplace,
    message,
  };
}
