import { createHash } from "node:crypto";
import type { CollectionOspReportingWindow, CollectionOspSavedTargetRevisionView } from "../storage-postgres-collection-types";

export function isCollectionOspBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Source configuration may be disabled for new matching without erasing saved
 * historical evidence. Missing legacy config is explicitly labelled, not
 * silently presented as current verified source validity. */
export function resolveCollectionOspReportingWindow(
  snapshot: { from: string; to: string },
  sources: Array<{ sourceImportId: string; validFrom: string | null; validTo: string | null }>,
): CollectionOspReportingWindow {
  if (sources.length < 1 || sources.length > 5 || new Set(sources.map((source) => source.sourceImportId)).size !== sources.length) {
    throw new Error("Saved Target must retain between one and five unique source identities.");
  }
  const resolved = sources.map((source) => {
    if ((source.validFrom === null) !== (source.validTo === null)) throw new Error("Source validity is incomplete.");
    const validFrom = source.validFrom ?? snapshot.from;
    const validTo = source.validTo ?? snapshot.to;
    if (!isCollectionOspBusinessDate(validFrom) || !isCollectionOspBusinessDate(validTo) || validFrom > validTo) {
      throw new Error("Source validity must contain ordered YYYY-MM-DD business dates.");
    }
    return { sourceImportId: source.sourceImportId, validFrom, validTo, configured: source.validFrom !== null };
  }).sort((left, right) => left.sourceImportId.localeCompare(right.sourceImportId, "en"));
  const from = resolved.reduce((date, source) => source.validFrom < date ? source.validFrom : date, resolved[0]!.validFrom);
  const to = resolved.reduce((date, source) => source.validTo > date ? source.validTo : date, resolved[0]!.validTo);
  const version = createHash("sha256").update(JSON.stringify(resolved)).digest("hex");
  return { from, to, version, sourceValidityVerified: resolved.every((source) => source.configured), sources: resolved };
}

export function collectionOspReportingRange(revision: CollectionOspSavedTargetRevisionView): { start: string; end: string } {
  return { start: revision.reportingWindow?.from ?? revision.from, end: revision.reportingWindow?.to ?? revision.to };
}

export function collectionOspBusinessToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function defaultCollectionOspAsOf(revision: CollectionOspSavedTargetRevisionView, now = new Date()): string {
  const { start, end } = collectionOspReportingRange(revision);
  const today = collectionOspBusinessToday(now);
  return today < start ? start : today > end ? end : today;
}
