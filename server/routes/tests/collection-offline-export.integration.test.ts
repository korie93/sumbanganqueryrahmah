import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { unzipSync } from "fflate";
import * as XLSX from "xlsx";
import { createCsrfProtectionMiddleware } from "../../http/csrf";
import type { PostgresStorage, CollectionRecordListFilters } from "../../storage-postgres";
import { registerCollectionOfflineExportRoute } from "../collection/collection-offline-export-route";
import { createCollectionRouteContext } from "../collection/collection-route-shared";
import { createJsonTestApp, createTestAuthenticateToken, createTestRequireRole, createTestRequireTabAccess, startTestServer, stopTestServer } from "./http-test-utils";

const id = "00000000-0000-4000-8000-000000000001";
const missing = "00000000-0000-4000-8000-000000000002";

async function fixture(t: test.TestContext, beforeList?: () => Promise<void>) {
  const queries: CollectionRecordListFilters[] = [];
  const audits: Array<{ action: string; performedBy: string; details: string }> = [];
  const row = { id, customerName: "Pelanggan Contoh", paymentDate: "2026-01-01", amount: "10.05",
    receipts: [] as { id: string; collectionRecordId: string; originalFileName: string; storagePath: string; fileHash: string }[],
    receiptCount: 0, sourceObligationKey: "private-obligation", settlementCycleKey: "private-cycle" };
  const rows = [row];
  const storage = {
    async listCollectionRecords(filters: CollectionRecordListFilters) {
      queries.push(filters);
      await beforeList?.();
      return rows.filter(record => filters.selectedRecordIds?.includes(record.id));
    },
    async createAuditLog(entry: typeof audits[number]) { audits.push(entry); },
  } as unknown as PostgresStorage;
  const app = createJsonTestApp();
  app.use(createCsrfProtectionMiddleware());
  registerCollectionOfflineExportRoute(createCollectionRouteContext(app, {
    storage, authenticateToken: createTestAuthenticateToken(), requireRole: createTestRequireRole(), requireTabAccess: createTestRequireTabAccess(),
  }));
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));
  const token = "a".repeat(64);
  const post = (body: unknown, role = "superuser", csrf = true, signal?: AbortSignal) => fetch(baseUrl + "/api/collection/export-selected-offline", {
    method: "POST", body: JSON.stringify(body), signal: signal ?? null,
    headers: { "content-type": "application/json", "x-test-role": role, "x-test-userid": "account-id", "x-test-username": "synthetic",
      Cookie: "sqr_auth=synthetic; sqr_csrf=" + token, ...(csrf ? { "X-CSRF-Token": token } : {}) },
  });
  const detail = (recordId: string, role = "superuser") => fetch(baseUrl + "/api/collection/export-selected-offline/records/" + recordId, {
    headers: { "x-test-role": role, "x-test-userid": "account-id", "x-test-username": "synthetic" },
  });
  return { post, detail, row, rows, audits, queries };
}

test("offline export requires authenticated superuser, CSRF and explicit distinct IDs", async t => {
  const { post, queries } = await fixture(t);
  assert.equal((await post({ recordIds: [id] }, "")).status, 401);
  for (const role of ["admin", "manager", "user"]) assert.equal((await post({ recordIds: [id] }, role)).status, 403);
  assert.equal((await post({ recordIds: [id] }, "superuser", false)).status, 403);
  for (const body of [{}, { recordIds: [] }, { recordIds: "1" }, { recordIds: [id, id] }, { recordIds: [id], amount: 500 }, { recordIds: ["old"] }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal((await post({ recordIds: Array(1001).fill(id) })).status, 413);
  assert.equal(queries.length, 0);
});

test("preview must describe each selected record exactly once before any storage lookup", async t => {
  const { post, queries } = await fixture(t);
  const estimate = { id, cents: 1005, receipts: 0 };
  for (const expected of [null, {}, [], [null], [{ ...estimate, id: missing }], [{ ...estimate, cents: 10.05 }],
    [{ ...estimate, receipts: -1 }], [{ ...estimate, cents: "1005" }], [{ ...estimate, extra: true }]]) {
    assert.equal((await post({ recordIds: [id], expected })).status, 400);
  }
  assert.equal((await post({ recordIds: [id, missing], expected: [estimate, estimate] })).status, 400);
  assert.equal(queries.length, 0);
});

test("only a superuser can request workbook columns and invalid lists are rejected before querying", async t => {
  const { post, queries } = await fixture(t);
  for (const columns of [null, [], "amount", [false], ["unknown"], ["amount", "amount"]]) {
    assert.equal((await post({ recordIds: [id], columns })).status, 400);
  }
  for (const role of ["user", "admin", "manager"]) {
    assert.equal((await post({ recordIds: [id], columns: ["amount"] }, role)).status, 403);
  }
  assert.equal(queries.length, 0);
  const response = await post({ recordIds: [id], columns: ["amount"] });
  assert.equal(response.status, 200);
  const zip = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const book = XLSX.read(zip[Object.keys(zip).find(name => name.endsWith(".xlsx"))!], { type: "array" });
  assert.deepEqual(book.SheetNames, ["Collection Records", "Export Info"]);
  assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets["Collection Records"], { header: 1 }), [["Jumlah Bayaran"], [10.05]]);
});

test("daily collection export delivers the six selected columns in workbook order", async t => {
  const { post } = await fixture(t);
  const response = await post({ recordIds: [id], columns: [
    "customerName", "cardNumber", "accountNumber", "amount", "paymentDate", "receipt",
  ] });
  assert.equal(response.status, 200);
  const zip = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const workbookPath = Object.keys(zip).find(name => name.endsWith(".xlsx"));
  assert.ok(workbookPath);
  const book = XLSX.read(zip[workbookPath], { type: "array" });
  const sheet = book.Sheets["Collection Records"];
  const [headings, row] = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  assert.deepEqual(headings, ["Nama Pelanggan", "No. Kad", "No. Akaun", "Jumlah Bayaran", "Tarikh Bayaran", "Resit"]);
  assert.equal(row[0], "Pelanggan Contoh");
  assert.equal(row[3], 10.05);
});

test("verified values follow selection order; a second change requires another review before a ZIP is prepared", async t => {
  const { post, row, rows, audits } = await fixture(t);
  rows.push({ ...row, id: missing, amount: "0.00" });
  const recordIds = [missing, id];
  const preview = [{ id, cents: 2000, receipts: 0 }, { id: missing, cents: 0, receipts: 1 }];
  const first = await post({ recordIds, expected: preview });
  assert.equal(first.status, 409);
  assert.equal(first.headers.get("content-disposition"), null);
  const actual = [{ id: missing, cents: 0, receipts: 0 }, { id, cents: 1005, receipts: 0 }];
  const error = (await first.json()).error;
  assert.equal(error.code, "OFFLINE_EXPORT_SELECTION_CHANGED");
  assert.deepEqual(error.details, { changes: actual });
  row.amount = "12.34";
  const second = await post({ recordIds, expected: actual });
  assert.equal(second.status, 409);
  assert.deepEqual((await second.json()).error.details, { changes: [{ id, cents: 1234, receipts: 0 }] });
  assert.equal(audits.some(a => JSON.parse(a.details).outcome === "prepared"), false);
  const verified = await post({ recordIds, expected: [actual[0], { id, cents: 1234, receipts: 0 }] });
  assert.equal(verified.status, 200);
  assert.match(verified.headers.get("content-type") ?? "", /application\/zip/);
  await verified.arrayBuffer();
});

test("unavailable IDs are resolved before disclosing any changed amounts", async t => {
  const { post } = await fixture(t);
  const result = await post({ recordIds: [id, missing], expected: [id, missing].map(key => ({ id: key, cents: 0, receipts: 0 })) });
  assert.equal(result.status, 409);
  assert.deepEqual((await result.json()).error.details, { unavailableIds: [missing] });
});

test("an incomplete receipt list is diagnosed before presenting its claimed count for approval", async t => {
  const { post, row } = await fixture(t);
  row.receiptCount = 2;
  const response = await post({ recordIds: [id], expected: [{ id, cents: 500, receipts: 1 }] });
  assert.equal(response.status, 409);
  const { error } = await response.json();
  assert.equal(error.code, "INVALID_RECEIPT");
  assert.deepEqual(error.details, { recordId: id, receiptNumber: null, receiptCount: 2 });
  assert.equal(response.headers.get("content-disposition"), null);
});

test("off-page detail enforces the export scope, audits the read and omits internal storage data", async t => {
  const { detail, row, queries, audits } = await fixture(t);
  assert.equal((await detail(id, "")).status, 401);
  for (const role of ["user", "admin", "manager"]) assert.equal((await detail(id, role)).status, 403);
  assert.equal((await detail("invalid")).status, 400);
  assert.equal(queries.length, 0);
  assert.equal((await detail(missing)).status, 404);
  row.receipts.push({ id: missing, collectionRecordId: id, storagePath: "/private/example.pdf",
    originalFileName: "Contoh.pdf", fileHash: "private-hash" });
  const response = await detail(id);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const body = await response.json();
  assert.equal(body.record.customerName, row.customerName);
  assert.equal(body.record.receipts[0].id, missing);
  assert.equal(body.record.receipts[0].originalFileName, "Contoh.pdf");
  assert.doesNotMatch(JSON.stringify(body), /private-|\/private\//);
  assert.deepEqual(audits.map(a => a.action), ["view_offline_export_record"]);
});

test("offline export rejects stale selection atomically, then downloads only valid selection", async t => {
  const { post, queries, audits } = await fixture(t);
  const stale = await post({ recordIds: [id, missing] });
  assert.equal(stale.status, 409);
  assert.deepEqual((await stale.json()).error.details, { unavailableIds: [missing] });
  assert.deepEqual(queries[0], { selectedRecordIds: [id, missing], limit: 2 });
  const response = await post({ recordIds: [id] });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("content-type") ?? "", /application\/zip/);
  assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename="SQR_Collection_Selected_/);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(bytes.length, Number(response.headers.get("content-length")));
  assert.ok(Object.keys(unzipSync(bytes)).some(name => name.endsWith("/Collection_Selected.xlsx")));
  for (let i = 0; i < 50 && !audits.some(a => JSON.parse(a.details).outcome === "downloaded"); i++) await delay(10);
  assert.deepEqual(audits.map(a => JSON.parse(a.details).outcome), ["OFFLINE_EXPORT_RECORDS_UNAVAILABLE", "prepared", "downloaded"]);
  for (const entry of audits) {
    assert.equal(entry.performedBy, "account-id");
    assert.equal(entry.action, "export_selected_offline");
    assert.doesNotMatch(entry.details, /Pelanggan|00000000-0000/);
  }
});

test("concurrent export is rejected and disconnect releases the slot", async t => {
  let signalEntry!: () => void;
  let release!: () => void;
  const entered = new Promise<void>(resolve => { signalEntry = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const { post, audits } = await fixture(t, async () => { signalEntry(); await released; });
  const controller = new AbortController();
  const first = post({ recordIds: [id] }, "superuser", true, controller.signal);
  try {
    await entered;
    const busy = await post({ recordIds: [id] });
    assert.equal(busy.status, 429);
    assert.equal(busy.headers.get("retry-after"), "60");
    controller.abort();
    await assert.rejects(first, { name: "AbortError" });
  } finally {
    release();
  }
  for (let i = 0; i < 100 && !audits.some(a => JSON.parse(a.details).outcome === "cancelled"); i++) await delay(10);
  assert.ok(audits.some(a => JSON.parse(a.details).outcome === "cancelled"));
  assert.equal((await post({ recordIds: [id] })).status, 200);
});
