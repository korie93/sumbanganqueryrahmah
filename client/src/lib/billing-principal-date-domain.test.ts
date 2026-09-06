import assert from "node:assert/strict";
import test from "node:test";
import {
  billingPrincipalTargetMetadataChanged, clampBillingPrincipalDate, clampBillingPrincipalMonth,
  defaultBillingPrincipalAsOf, getBillingPrincipalReportingWindow,
  isBillingPrincipalDate, isBillingPrincipalDateInRange,
} from "./billing-principal-date-domain";
import { createBillingPrincipalVisualExportFixture } from "../pages/collection/billing-principal-v7-test-fixture";

const range = { from: "2026-08-12", to: "2026-09-10" };

test("OSP date validation is strict, leap-aware and never accepts timestamp coercion", () => {
  for (const value of ["2026-08-27", "2024-02-29", "2000-02-29", "0001-01-01"]) assert.equal(isBillingPrincipalDate(value), true, value);
  for (const value of ["2026-02-29", "2026-02-30", "1900-02-29", "2026-09-31", "2026-13-01", "0000-01-01", "2026-8-27", "2026-08-27T00:00:00Z", " 2026-08-27", "27/08/2026", ""]) assert.equal(isBillingPrincipalDate(value), false, value);
});

test("OSP default clamps Malaysia today before, within and after inclusive source validity", () => {
  assert.equal(defaultBillingPrincipalAsOf(range, new Date("2026-08-01T10:00:00Z")), range.from);
  assert.equal(defaultBillingPrincipalAsOf(range, new Date("2026-09-06T10:00:00Z")), "2026-09-06");
  assert.equal(defaultBillingPrincipalAsOf(range, new Date("2026-10-01T10:00:00Z")), range.to);
  assert.equal(defaultBillingPrincipalAsOf(range, new Date("2026-08-26T15:59:59Z")), "2026-08-26");
  assert.equal(defaultBillingPrincipalAsOf(range, new Date("2026-08-26T16:00:00Z")), "2026-08-27");
});

test("OSP date and month state are revalidated when a target/source window shrinks", () => {
  assert.equal(clampBillingPrincipalDate("2026-09-08", { from: "2026-08-01", to: "2026-08-31" }), "2026-08-31");
  assert.equal(clampBillingPrincipalDate("2026-08-12", { from: "2026-08-15", to: "2026-09-05" }), "2026-08-15");
  assert.equal(clampBillingPrincipalDate("2026-08-27", range), "2026-08-27");
  assert.equal(clampBillingPrincipalDate("", range), range.from);
  assert.equal(clampBillingPrincipalMonth("2026-09", { from: "2026-08-01", to: "2026-08-31" }), "2026-08");
  assert.equal(clampBillingPrincipalMonth("2026-07", range), "2026-08");
  assert.equal(clampBillingPrincipalMonth("2026-08", range), "2026-08");
  assert.equal(clampBillingPrincipalMonth("2026-13", range), "2026-08");
  for (const value of [range.from, "2026-08-27", range.to]) assert.equal(isBillingPrincipalDateInRange(value, range), true);
  for (const value of ["2026-08-11", "2026-09-11", "2026-08-32"]) assert.equal(isBillingPrincipalDateInRange(value, range), false);
});

test("live source window overrides immutable dates without changing the saved TT OSP baseline", () => {
  const target = createBillingPrincipalVisualExportFixture().overview.target;
  const previousFrom = target.activeRevision.from;
  const liveWindow = { ...range, version: "live-v1", sourceValidityVerified: true,
    sources: [{ sourceImportId: target.activeRevision.sourceImportIds[0]!, validFrom: range.from, validTo: range.to, configured: true }] };
  target.activeRevision.reportingWindow = liveWindow;
  assert.equal(getBillingPrincipalReportingWindow(target.activeRevision), liveWindow);
  assert.equal(target.activeRevision.from, previousFrom);
  const changed = { ...target, activeRevision: { ...target.activeRevision, reportingWindow: { ...liveWindow, version: "live-v2" } } };
  assert.equal(changed.version, target.version);
  assert.equal(billingPrincipalTargetMetadataChanged(target, changed), true, "Per-source validity changes matter even if target version and outer date envelope remain unchanged");
  assert.equal(billingPrincipalTargetMetadataChanged(target, structuredClone(target)), false);
});

test("older servers retain an explicit stable legacy date fallback without inventing live validity", () => {
  const revision = createBillingPrincipalVisualExportFixture().overview.revision;
  delete revision.reportingWindow;
  revision.sourceValidityVerified = false;
  const fallback = getBillingPrincipalReportingWindow(revision);
  assert.equal(fallback.from, revision.from);
  assert.equal(fallback.to, revision.to);
  assert.equal(fallback.sourceValidityVerified, false);
  assert.ok(fallback.sources.every((source) => !source.configured));
  assert.equal(fallback.version, getBillingPrincipalReportingWindow(revision).version);
});
