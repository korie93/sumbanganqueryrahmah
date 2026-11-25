// Fixed workbook order, including the legacy full export.
export const collectionExcelColumns = [
  { id: "customerName", label: "Nama Pelanggan", width: 32 },
  { id: "cardNumber", label: "No. Kad", width: 24 },
  { id: "accountNumber", label: "No. Akaun", width: 24 },
  { id: "amount", label: "Jumlah Bayaran", width: 19 },
  { id: "paymentDate", label: "Tarikh Bayaran", width: 18 },
  { id: "receipt", label: "Resit", width: 40 },
  { id: "cpStatus", label: "Status CP", width: 18 },
  { id: "recordId", label: "Record ID", width: 40 },
  { id: "icNumber", label: "No. IC", width: 21 },
  { id: "customerPhone", label: "No. Telefon", width: 20 },
  { id: "nickname", label: "Nickname", width: 23 },
  { id: "batch", label: "Batch", width: 14 },
  { id: "sourceName", label: "Fail Sumber", width: 34 },
  { id: "sourceFilename", label: "Nama Fail Asal", width: 34 },
  { id: "aging", label: "Aging", width: 13 },
  { id: "billingPrincipalOsp", label: "Billing Principal (OSP)", width: 25 },
  { id: "totalDue", label: "Jumlah Perlu Dibayar", width: 24 },
  { id: "cumulativeCollected", label: "Kutipan Terkumpul", width: 23 },
  { id: "remainingAmount", label: "Baki Bayaran", width: 19 },
  { id: "sourceMatchAccuracy", label: "Ketepatan Padanan (%)", width: 25 },
  { id: "sourceMatchBasis", label: "Asas Padanan", width: 22 },
  { id: "callingDate", label: "Tarikh Panggilan", width: 20 },
  { id: "callingWindowEnd", label: "Akhir Tempoh Panggilan", width: 24 },
  { id: "receiptCount", label: "Bilangan Resit", width: 19 },
  { id: "receiptTotalAmount", label: "Jumlah Resit", width: 19 },
  { id: "receiptValidationStatus", label: "Status Semakan Resit", width: 24 },
  { id: "receiptValidationMessage", label: "Catatan Semakan Resit", width: 40 },
  { id: "duplicateReceiptFlag", label: "Resit Bertindih", width: 19 },
  { id: "automaticCpStatus", label: "Status CP Automatik", width: 22 },
  { id: "effectiveSettlementSource", label: "Sumber Penyelesaian", width: 25 },
  { id: "effectiveSettlementDate", label: "Tarikh Penyelesaian", width: 23 },
  { id: "poolAmount", label: "Bayaran POOL", width: 19 },
  { id: "effectiveTotal", label: "Jumlah Ketika Pengesahan", width: 29 },
  { id: "poolStatus", label: "Status POOL", width: 21 },
  { id: "validity", label: "Kesahan POOL", width: 28 },
  { id: "settlementDate", label: "Tarikh POOL", width: 18 },
  { id: "reason", label: "Sebab POOL", width: 30 },
  { id: "reference", label: "Rujukan POOL", width: 25 },
  { id: "note", label: "Catatan POOL", width: 40 },
  { id: "verifiedBy", label: "Disahkan Oleh", width: 22 },
  { id: "verifiedAt", label: "Disahkan Pada (UTC)", width: 24 },
  { id: "revokedReason", label: "Sebab Pembatalan POOL", width: 32 },
  { id: "revokedBy", label: "Dibatalkan Oleh", width: 22 },
  { id: "revokedAt", label: "Dibatalkan Pada (UTC)", width: 25 },
  { id: "createdByLogin", label: "Direkod Oleh", width: 22 },
  { id: "createdAt", label: "Dicipta (UTC)", width: 24 },
  { id: "updatedAt", label: "Dikemas Kini (UTC)", width: 24 },
] as const;

export type CollectionExcelColumnId = typeof collectionExcelColumns[number]["id"];
export const allCollectionExcelColumnIds = collectionExcelColumns.map(column => column.id);

export function parseCollectionExcelColumns(input: unknown): CollectionExcelColumnId[] | null {
  if (!Array.isArray(input) || !input.length || input.length > collectionExcelColumns.length) return null;
  const requested = new Set<unknown>(input);
  const ordered = allCollectionExcelColumnIds.filter(id => requested.has(id));
  return ordered.length === input.length ? ordered : null;
}
