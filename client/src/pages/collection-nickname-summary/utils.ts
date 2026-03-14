import type { CollectionRecord } from "@/lib/api";
import { COLLECTION_BATCH_OPTIONS } from "@/pages/collection/utils";

export type NicknameTotalSummary = {
  nickname: string;
  totalAmount: number;
  totalRecords: number;
};

export type NicknameBatchSection = {
  batch: string;
  rows: CollectionRecord[];
  totalAmount: number;
  totalRecords: number;
};

export function buildCustomerDisplayName(record: CollectionRecord): string {
  const customerName = String(record.customerName || "").trim();
  const accountNumber = String(record.accountNumber || "").trim();
  if (customerName && accountNumber) {
    return `${customerName}_${accountNumber}`;
  }
  return customerName || accountNumber || "-";
}

export function buildNicknameTotals(records: CollectionRecord[]): NicknameTotalSummary[] {
  const grouped = new Map<string, NicknameTotalSummary>();

  for (const record of records) {
    const nickname = String(record.collectionStaffNickname || "").trim() || "Unknown";
    const current = grouped.get(nickname) || {
      nickname,
      totalAmount: 0,
      totalRecords: 0,
    };
    const amount = Number(record.amount);
    current.totalRecords += 1;
    current.totalAmount += Number.isFinite(amount) ? amount : 0;
    grouped.set(nickname, current);
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.nickname.localeCompare(b.nickname, undefined, { sensitivity: "base" }),
  );
}

export function buildNicknameBatchSections(records: CollectionRecord[]): NicknameBatchSection[] {
  const grouped = new Map<string, NicknameBatchSection>();

  for (const record of records) {
    const batch = String(record.batch || "").trim() || "Unknown";
    const current = grouped.get(batch) || {
      batch,
      rows: [],
      totalAmount: 0,
      totalRecords: 0,
    };
    const amount = Number(record.amount);
    current.rows.push(record);
    current.totalRecords += 1;
    current.totalAmount += Number.isFinite(amount) ? amount : 0;
    grouped.set(batch, current);
  }

  const orderedBatches = [
    ...COLLECTION_BATCH_OPTIONS,
    ...Array.from(grouped.keys()).filter((batch) => !COLLECTION_BATCH_OPTIONS.includes(batch as any)),
  ];

  return orderedBatches
    .map((batch) => grouped.get(batch))
    .filter((section): section is NicknameBatchSection => Boolean(section));
}
