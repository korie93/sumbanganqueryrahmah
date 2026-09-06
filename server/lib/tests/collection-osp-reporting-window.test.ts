import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionOspBusinessToday,
  collectionOspReportingRange,
  defaultCollectionOspAsOf,
  isCollectionOspBusinessDate,
  resolveCollectionOspReportingWindow,
} from "../collection-osp-reporting-window";
import type { CollectionOspSavedTargetRevisionView } from "../../storage-postgres-collection-types";

const snapshot = { from: "2026-09-01", to: "2026-09-30" };
const source = { sourceImportId: "source-a", validFrom: "2026-08-12", validTo: "2026-09-10" };

function revision(): CollectionOspSavedTargetRevisionView {
  return {
    id: "revision-a", revisionNumber: 1, ...snapshot,
    trackingStartDate: snapshot.from, trackingEndDate: snapshot.to,
    sourceImportIds: [source.sourceImportId], sourceSnapshots: [],
    agingScope: ["D3", "D4", "D5", "D6"], nicknameScope: [], createdAt: "2026-09-01T00:00:00Z",
    reportingWindow: resolveCollectionOspReportingWindow(snapshot, [source]),
  };
}

test("live reporting window supersedes immutable snapshot dates and changes its own fingerprint", () => {
  const saved = revision();
  assert.deepEqual(collectionOspReportingRange(saved), { start: "2026-08-12", end: "2026-09-10" });
  assert.equal(saved.from, snapshot.from);
  assert.equal(saved.to, snapshot.to);
  assert.equal(saved.reportingWindow?.sourceValidityVerified, true);
  const updated = resolveCollectionOspReportingWindow(snapshot, [{ ...source, validFrom: "2026-08-15", validTo: "2026-09-05" }]);
  assert.notEqual(updated.version, saved.reportingWindow?.version);
  assert.deepEqual([updated.from, updated.to], ["2026-08-15", "2026-09-05"]);
  assert.equal(saved.reportingWindow?.version, resolveCollectionOspReportingWindow(snapshot, [source]).version);
});

test("multisource envelope retains each source's bounds and stable order-independent fingerprint", () => {
  const second = { sourceImportId: "source-b", validFrom: "2026-08-20", validTo: "2026-09-20" };
  const window = resolveCollectionOspReportingWindow(snapshot, [second, source]);
  assert.deepEqual([window.from, window.to], ["2026-08-12", "2026-09-20"]);
  assert.deepEqual(window.sources, [{ ...source, configured: true }, { ...second, configured: true }]);
  assert.equal(window.version, resolveCollectionOspReportingWindow(snapshot, [source, second]).version);
  assert.notEqual(window.version, resolveCollectionOspReportingWindow(snapshot, [source, { ...second, validFrom: "2026-08-21" }]).version,
    "own-source validity changes must invalidate even when overall bounds are unchanged");
});

test("missing legacy config explicitly labels snapshot fallback unverified", () => {
  const missing = { sourceImportId: "legacy-source", validFrom: null, validTo: null };
  const window = resolveCollectionOspReportingWindow(snapshot, [missing]);
  assert.deepEqual([window.from, window.to], [snapshot.from, snapshot.to]);
  assert.equal(window.sourceValidityVerified, false);
  assert.deepEqual(window.sources, [{ sourceImportId: missing.sourceImportId, validFrom: snapshot.from, validTo: snapshot.to, configured: false }]);
  assert.notEqual(window.version, resolveCollectionOspReportingWindow(snapshot, [{ sourceImportId: missing.sourceImportId, validFrom: snapshot.from, validTo: snapshot.to }]).version);
  const saved = revision();
  delete saved.reportingWindow;
  assert.deepEqual(collectionOspReportingRange(saved), { start: snapshot.from, end: snapshot.to });
});

test("resolver rejects invalid, partial, reversed, duplicate and unbounded source identities", () => {
  for (const sources of [
    [], [source, source], Array.from({ length: 6 }, (_, index) => ({ ...source, sourceImportId: `source-${index}` })),
    [{ ...source, validFrom: null }], [{ ...source, validTo: null }],
    [{ ...source, validFrom: "2026-08-32" }], [{ ...source, validTo: "2026-08-01" }],
  ]) assert.throws(() => resolveCollectionOspReportingWindow(snapshot, sources));
});

test("business DATE is strict and leap-day safe, not a timestamp", () => {
  for (const invalid of ["", "0000-01-01", "2026-02-29", "2026-13-01", "2026-8-27", "2026-08-27T00:00:00Z", " 2026-08-27"])
    assert.equal(isCollectionOspBusinessDate(invalid), false, invalid);
  for (const valid of ["2026-08-27", "2028-02-29", "0099-01-01", "9999-12-31"])
    assert.equal(isCollectionOspBusinessDate(valid), true, valid);
});

test("default As Of clamps Malaysian business today inclusively without UTC midnight drift", () => {
  const saved = revision();
  for (const [instant, today, asOf] of [
    ["2026-08-11T15:59:59.999Z", "2026-08-11", "2026-08-12"],
    ["2026-08-11T16:00:00.000Z", "2026-08-12", "2026-08-12"],
    ["2026-09-05T16:00:00.000Z", "2026-09-06", "2026-09-06"],
    ["2026-09-10T15:59:59.999Z", "2026-09-10", "2026-09-10"],
    ["2026-09-10T16:00:00.000Z", "2026-09-11", "2026-09-10"],
  ]) {
    assert.equal(collectionOspBusinessToday(new Date(instant!)), today);
    assert.equal(defaultCollectionOspAsOf(saved, new Date(instant!)), asOf);
  }
});
