import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReadableAuditDetails,
  getReadableAuditDetailsPreview,
} from "@/pages/audit-logs/audit-log-readable-details";

test("buildReadableAuditDetails converts JSON payloads into user-friendly fields", () => {
  const details = buildReadableAuditDetails(JSON.stringify({
    role: "user",
    recordCount: 17,
    totalRecords: 17,
    page: 1,
    pageSize: 50,
    from: "2026-05-01",
    nicknameCount: 1,
    searchPresent: false,
  }));

  assert.equal(details.isJson, true);
  assert.deepEqual(details.items, [
    { key: "role", label: "Peranan", value: "User" },
    { key: "recordCount", label: "Rekod dipaparkan", value: "17" },
    { key: "totalRecords", label: "Jumlah rekod", value: "17" },
    { key: "page", label: "Halaman", value: "1" },
    { key: "pageSize", label: "Rekod setiap halaman", value: "50" },
    { key: "from", label: "Tarikh mula", value: "01/05/2026" },
    { key: "nicknameCount", label: "Bilangan nickname", value: "1" },
    { key: "searchPresent", label: "Carian digunakan", value: "Tidak" },
  ]);
});

test("getReadableAuditDetailsPreview keeps normal text details unchanged", () => {
  assert.equal(
    getReadableAuditDetailsPreview("User clicked Login"),
    "User clicked Login",
  );
});

test("buildReadableAuditDetails treats malformed JSON as plain text", () => {
  const details = buildReadableAuditDetails("{bad-json");

  assert.equal(details.isJson, false);
  assert.deepEqual(details.items, []);
  assert.equal(details.text, "{bad-json");
});

test("getReadableAuditDetailsPreview truncates readable JSON details safely", () => {
  assert.equal(
    getReadableAuditDetailsPreview(JSON.stringify({ recordCount: 17, totalRecords: 80 }), 32),
    "Rekod dipaparkan: 17; Jumlah...",
  );
});

test("buildReadableAuditDetails flattens metadata audit payloads", () => {
  const details = buildReadableAuditDetails(JSON.stringify({
    metadata: {
      previous_role: "user",
      next_role: "admin",
      lock_cleared: true,
      expires_at: "2026-05-19T02:30:00.000Z",
    },
  }));

  assert.match(details.text, /Peranan sebelum: user/);
  assert.match(details.text, /Peranan selepas: admin/);
  assert.match(details.text, /Tamat tempoh: 19\/05\/2026, 10:30 AM/);
  assert.match(details.text, /Lock akaun dibersihkan: Ya/);
});

test("buildReadableAuditDetails formats collection record and receipt payloads", () => {
  const details = buildReadableAuditDetails(JSON.stringify({
    event: "collection_record_updated",
    recordId: "record-1",
    before: {
      amount: 100,
      paymentDate: "2026-05-01",
    },
    after: {
      amount: 120,
      paymentDate: "2026-05-02",
    },
    receipts: {
      beforeCount: 1,
      afterCount: 2,
      addedCount: 1,
      replaced: true,
    },
  }));

  assert.match(details.text, /Event: Collection Record Updated/);
  assert.match(details.text, /ID rekod: record-1/);
  assert.match(details.text, /Sebelum - Tarikh bayaran: 01\/05\/2026/);
  assert.match(details.text, /Selepas - Tarikh bayaran: 02\/05\/2026/);
  assert.match(details.text, /Sebelum - Jumlah: (?:RM|MYR)\s?100\.00/);
  assert.match(details.text, /Resit - Resit diganti: Ya/);
});

test("buildReadableAuditDetails formats backup metrics and durations", () => {
  const details = buildReadableAuditDetails(JSON.stringify({
    backupId: "backup-1",
    totalProcessed: 1400,
    totalInserted: 1390,
    totalSkipped: 10,
    integrityVerified: true,
    durationMs: 1250,
    payloadBytes: 2048,
  }));

  assert.match(details.text, /ID backup: backup-1/);
  assert.match(details.text, /Jumlah diproses: 1,400/);
  assert.match(details.text, /Tempoh proses: 1\.3s/);
  assert.match(details.text, /Saiz payload: 2 KB/);
});
