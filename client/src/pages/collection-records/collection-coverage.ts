import type { CollectionRecord } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

export function getCollectionCpStatusLabel(
  record: Pick<CollectionRecord, "cpStatus"> & Partial<Pick<CollectionRecord, "effectiveSettlementSource" | "manualSettlement">>,
) {
  const base = record.cpStatus === "abort_cp" ? "Abort CP" : record.cpStatus === "cp" ? "CP" : "Unverified";
  const manual = record.manualSettlement;
  if (!manual) return base;
  if (manual.status === "REVOKED") return `${base} · Manual revoked`;
  if (manual.validity === "EFFECTIVE" && record.effectiveSettlementSource === "MANUAL_VERIFIED") {
    return `${base} · Manual Verified · POOL ${formatAmountRM(manual.poolAmount)}`;
  }
  if (manual.validity === "SUPERSEDED_BY_AUTOMATIC") return `${base} · POOL superseded`;
  return `${base} · POOL requires revalidation`;
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
