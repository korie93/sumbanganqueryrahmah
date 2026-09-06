import type { BillingPrincipalSavedTarget, BillingPrincipalSavedTargetRevision } from "./api/collection-billing-principal";
import { formatDateKeyInMalaysia } from "./date-format";

/** Business DATE validation: no timestamp coercion or impossible calendar dates. */
export function isBillingPrincipalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getBillingPrincipalReportingWindow(revision: BillingPrincipalSavedTargetRevision) {
  return revision.reportingWindow ?? {
    from: revision.from,
    to: revision.to,
    version: `legacy:${revision.id}:${revision.from}:${revision.to}`,
    sourceValidityVerified: revision.sourceValidityVerified ?? false,
    sources: revision.sourceImportIds.map((sourceImportId) => ({
      sourceImportId, validFrom: revision.from, validTo: revision.to, configured: false,
    })),
  };
}

export function clampBillingPrincipalDate(value: string, range: { from: string; to: string }): string {
  if (!isBillingPrincipalDate(value)) return range.from;
  return value < range.from ? range.from : value > range.to ? range.to : value;
}

export function defaultBillingPrincipalAsOf(range: { from: string; to: string }, now = new Date()): string {
  return clampBillingPrincipalDate(formatDateKeyInMalaysia(now), range);
}

export function isBillingPrincipalDateInRange(value: string, range: { from: string; to: string }): boolean {
  return isBillingPrincipalDate(value) && value >= range.from && value <= range.to;
}

export function clampBillingPrincipalMonth(month: string, range: { from: string; to: string }): string {
  const first = range.from.slice(0, 7);
  const last = range.to.slice(0, 7);
  if (!isBillingPrincipalDate(month + "-01")) return first;
  return month < first ? first : month > last ? last : month;
}

export function billingPrincipalTargetMetadataChanged(current: BillingPrincipalSavedTarget, latest: BillingPrincipalSavedTarget): boolean {
  return current.id !== latest.id || current.version !== latest.version
    || current.activeRevision.id !== latest.activeRevision.id
    || getBillingPrincipalReportingWindow(current.activeRevision).version !== getBillingPrincipalReportingWindow(latest.activeRevision).version;
}
