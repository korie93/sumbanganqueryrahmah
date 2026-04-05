export type MultipartCollectionBody = Record<string, unknown> & {
  removeReceipt?: boolean;
  removeReceiptIds?: string[];
};

export function normalizeCollectionMultipartFieldName(rawName: string): string {
  const normalized = String(rawName || "").trim();
  return normalized.endsWith("[]") ? normalized.slice(0, -2) : normalized;
}

export function isCollectionReceiptMultipartField(rawName: string): boolean {
  const normalizedField = normalizeCollectionMultipartFieldName(rawName);
  return normalizedField === "receipts" || normalizedField === "receipt";
}

export function appendCollectionMultipartField(
  body: MultipartCollectionBody,
  rawName: string,
  value: string,
) {
  const fieldName = normalizeCollectionMultipartFieldName(rawName);
  const normalizedValue = String(value || "");

  if (fieldName === "removeReceipt") {
    body.removeReceipt = normalizedValue === "true";
    return;
  }

  if (fieldName === "removeReceiptIds") {
    const currentValues = Array.isArray(body.removeReceiptIds)
      ? body.removeReceiptIds.map((item) => String(item || ""))
      : [];
    currentValues.push(normalizedValue);
    body.removeReceiptIds = currentValues;
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(body, fieldName)) {
    body[fieldName] = normalizedValue;
    return;
  }

  const currentValue = body[fieldName];
  if (Array.isArray(currentValue)) {
    currentValue.push(normalizedValue);
    body[fieldName] = currentValue;
    return;
  }

  body[fieldName] = [currentValue, normalizedValue];
}
