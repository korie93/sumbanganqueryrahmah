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

test("getReadableAuditDetailsPreview truncates readable JSON details safely", () => {
  assert.equal(
    getReadableAuditDetailsPreview(JSON.stringify({ recordCount: 17, totalRecords: 80 }), 32),
    "Rekod dipaparkan: 17; Jumlah...",
  );
});
