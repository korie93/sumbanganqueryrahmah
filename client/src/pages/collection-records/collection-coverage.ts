import type { CollectionRecord } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

export function getCollectionCpStatusLabel(record: Pick<CollectionRecord, "cpStatus">) {
  if (record.cpStatus === "abort_cp") return "Abort CP";
  if (record.cpStatus === "cp") return "CP";
  return "Unverified";
}

export function formatCollectionOptionalAmount(value: string | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : formatAmountRM(value);
}

export function formatCollectionMaskedCard(last4: string | null | undefined) {
  const normalized = String(last4 || "").trim().slice(-4);
  return normalized ? `**** ${normalized}` : "-";
}

export function getCollectionMatchAccuracyLabel(
  value: number | null | undefined,
) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}%` : "-";
}
