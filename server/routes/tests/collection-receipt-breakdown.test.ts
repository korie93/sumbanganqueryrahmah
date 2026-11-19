import assert from "node:assert/strict";
import test from "node:test";
import { collectionReceiptBreakdownSchema } from "../../../shared/collection-receipt-breakdown";
import { findCollectionReceiptDuplicateSummariesByHash } from "../../repositories/collection-receipt-lookup-utils";
import { collectBoundValues, collectSqlText, createSequenceExecutor } from "../../repositories/tests/sql-test-utils";
import { registerCollectionRoutes } from "../collection.routes";
import { createCoreCollectionStorageDouble } from "./collection-route-record-doubles";
import { createJsonTestApp, createTestAuthenticateToken, createTestRequireRole, createTestRequireTabAccess, startTestServer, stopTestServer } from "./http-test-utils";

const id = "11111111-1111-4111-8111-111111111111";
const peer = "22222222-2222-4222-8222-222222222222";
const uniqueHash = "a".repeat(64);
const sharedHash = "b".repeat(64);
const sampleDate = new Date("2026-03-01T00:00:00Z");
function receipt(name: string, fileHash: string | null, receiptAmount: string | null, deletedAt: Date | null = null) {
  return { id: name, collectionRecordId: id, storagePath: "/synthetic/" + name, originalFileName: name,
    originalMimeType: "image/png", originalExtension: ".png", fileSize: 100, fileHash, receiptAmount,
    createdAt: sampleDate, deletedAt };
}

async function fixture(receipts: ReturnType<typeof receipt>[]) {
  const { storage } = createCoreCollectionStorageDouble({
    seedRecordOverrides: { id, totalDue: "250.00", amount: "3250.00", duplicateReceiptFlag: false },
    receiptRowsByRecordId: { [id]: receipts },
  });
  storage.getCollectionNicknameSessionByActivity = async activityId => activityId === "leader-session"
    ? { activityId, username: "leader", userRole: "admin", nickname: "Leader", verifiedAt: sampleDate, updatedAt: sampleDate }
    : undefined;
  storage.getCollectionAdminGroupVisibleNicknameValuesByLeader = async () => ["Collector Alpha"];
  const queries: unknown[] = [];
  const comparisonCalls: string[][] = [];
  const receiptId = "33333333-3333-4333-8333-333333333333";
  storage.getCollectionReceiptComparison = async (origin, file, related) => {
    comparisonCalls.push([origin, file, related]);
    if (origin !== id || file !== receiptId || related !== peer) return null;
    const original = { batch: "P10", paymentDate: "2026-03-01", recordedAmount: "3250.00", fileName: "own.png", receiptAmount: "3000.00" };
    return { original, related: { ...original, fileName: "peer.png" } };
  };
  storage.findCollectionReceiptDuplicateSummaries = async (hashes, options) => {
    const sql = createSequenceExecutor([
      { rows: hashes.includes(sharedHash) ? [
        { id: "other-receipt", collection_record_id: peer, original_file_name: "private-peer-file.png", file_hash: sharedHash, created_at: sampleDate },
      ] : [] },
      { rows: [{ id: peer, batch: "P20", payment_date: "2026-03-02", account_number: null, card_number_last4: "0123" }] },
    ]);
    const result = await findCollectionReceiptDuplicateSummariesByHash(sql.executor, hashes, options);
    queries.push(...sql.queries);
    return result;
  };
  const app = createJsonTestApp();
  registerCollectionRoutes(app, { storage, authenticateToken: createTestAuthenticateToken(),
    requireRole: createTestRequireRole(), requireTabAccess: createTestRequireTabAccess() });
  const { server, baseUrl } = await startTestServer(app);
  return {
    compare: (role: string, relatedId = peer, headers = {}) => fetch(baseUrl + "/api/collection/" + id + "/receipts/" + receiptId + "/compare/" + relatedId, {
      headers: { "x-test-role": role, "x-test-username": "operator", ...headers },
    }),
    comparisonCalls,
    queries, stop: () => stopTestServer(server),
    get: (role: string, username: string, recordId = id, headers = {}) =>
      fetch(baseUrl + "/api/collection/" + recordId + "/receipt-breakdown", {
        headers: { "x-test-role": role, "x-test-username": username, ...headers },
      }),
  };
}

test("receipt breakdown uses live matches and discloses masked peer details only to a superuser", async t => {
  const app = await fixture([
    receipt("own-unique.png", uniqueHash, "250.00"), receipt("own-shared.png", sharedHash, "3000.00"),
    receipt("removed.png", "c".repeat(64), "100.00", sampleDate),
  ]);
  t.after(app.stop);
  for (const [role, username] of [["user", "staff.user"], ["admin", "leader"], ["manager", "manager"], ["superuser", "superuser"]] as const) {
    app.queries.length = 0;
    const response = await app.get(role, username, id, { "x-test-activityid": "leader-session" });
    assert.equal(response.status, 200);
    const raw = await response.json();
    const data = collectionReceiptBreakdownSchema.parse(raw);
    assert.deepEqual([data.recordedAmount, data.sharedAmount, data.uniqueAmount, data.totalDue], ["3250.00", "3000.00", "250.00", "250.00"]);
    assert.equal(data.receiptCount, 2);
    assert.equal(data.unclassifiedCount, 0);
    assert.equal(data.sharedReceipts.length, 1);
    assert.equal(data.sharedReceipts[0]?.fileName, "own-shared.png");
    assert.doesNotMatch(JSON.stringify(raw), /private-peer-file|other-receipt|\/synthetic\//);
    assert.equal(app.queries.length, role === "superuser" ? 2 : 1);
    assert.match(collectSqlText(app.queries[0]), /deleted_at IS NULL/);
    assert.match(collectSqlText(app.queries[0]), /collection_record_id <>/);
    assert.deepEqual(collectBoundValues(app.queries[0]), [uniqueHash, sharedHash, id]);
    if (role === "superuser") {
      assert.deepEqual(data.sharedReceipts[0]?.related, { count: 1, records: [
        { recordId: peer, batch: "P20", paymentDate: "2026-03-02", accountLast4: null, cardLast4: "0123" },
      ] });
    } else {
      assert.ok(!("related" in raw.sharedReceipts[0]));
      assert.ok(!JSON.stringify(raw).includes(peer));
    }
  }
});

test("only superusers can request a comparison and stale matches return no financial details", async t => {
  const app = await fixture([]);
  t.after(app.stop);
  for (const role of ["user", "admin", "manager"]) assert.equal((await app.compare(role)).status, 403);
  assert.equal((await app.compare("")).status, 401);
  assert.equal((await app.compare("superuser", "invalid")).status, 400);
  assert.equal(app.comparisonCalls.length, 0);
  const available = await app.compare("superuser");
  assert.equal(available.status, 200);
  const result = await available.json();
  assert.equal(result.original.fileName, "own.png");
  assert.equal(result.related.fileName, "peer.png");
  const missing = await app.compare("superuser", id);
  assert.equal(missing.status, 404);
  assert.ok(!("original" in await missing.json()));
});

test("receipt breakdown preserves missing amounts and excludes receipts without hashes from both groups", async t => {
  const app = await fixture([receipt("unclassified.png", null, "10.00"), receipt("shared.png", sharedHash, null), receipt("zero.png", uniqueHash, "0.00")]);
  t.after(app.stop);
  const response = await app.get("user", "staff.user");
  assert.equal(response.status, 200);
  const data = collectionReceiptBreakdownSchema.parse(await response.json());
  assert.equal(data.sharedAmount, null);
  assert.equal(data.uniqueAmount, "0.00");
  assert.equal(data.unclassifiedCount, 1);
  assert.equal(data.receiptCount, 3);
});

test("unauthenticated, disabled-tab, foreign record, malformed and missing record requests never look up peers", async t => {
  const app = await fixture([receipt("shared.png", sharedHash, "3000.00")]);
  t.after(app.stop);
  assert.equal((await app.get("", "")).status, 401);
  assert.equal((await app.get("user", "staff.user", id, { "x-test-deny-tabs": "collection-report" })).status, 403);
  assert.equal((await app.get("user", "another.user")).status, 403);
  assert.equal((await app.get("admin", "another.leader")).status, 403);
  assert.equal((await app.get("superuser", "superuser", peer)).status, 404);
  assert.equal((await app.get("superuser", "superuser", "invalid")).status, 400);
  assert.equal(app.queries.length, 0);
});
