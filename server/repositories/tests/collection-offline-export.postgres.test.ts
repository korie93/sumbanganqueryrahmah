import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { unzipSync } from "fflate";
import * as XLSX from "xlsx";

const disposable = process.env.SQR_AUTH_ISOLATED_CLUSTER === "1" && process.env.PG_DATABASE === "sqr_collection_offline_test";

test("selected Collection SQL and downloaded offline ZIP reconcile on disposable PostgreSQL", { skip: !disposable }, async t => {
  assert.equal(process.env.PG_HOST, "127.0.0.1");
  assert.equal(process.env.PG_USER, "sqr_fixture");
  assert.equal(process.env.DATABASE_URL, undefined);
  delete process.env.SQR_AUTH_ISOLATED_CLUSTER;
  const runtime = await import("../../db-postgres");
  runtime.stopPgPoolBackgroundTasks();
  const originalCwd = process.cwd();
  try {
    const instance = await runtime.pool.query("SELECT current_database() AS name, current_setting('data_directory') AS directory");
    assert.equal(instance.rows[0].name, "sqr_collection_offline_test");
    const data = await realpath(instance.rows[0].directory);
    assert.equal(path.dirname(path.dirname(data)), await realpath(os.tmpdir()));
    assert.match(path.basename(path.dirname(data)), /^sqr-auth-recovery-[a-zA-Z0-9]+$/);
    await migrate(runtime.db, { migrationsFolder: "./drizzle" });
    process.chdir(path.dirname(data));
    const { listCollectionRecords } = await import("../collection-record-read-utils");
    const { COLLECTION_RECEIPT_DIR } = await import("../../lib/collection-receipt-files");
    assert.equal(COLLECTION_RECEIPT_DIR, path.join(path.dirname(data), "uploads", "collection-receipts"));
    await mkdir(COLLECTION_RECEIPT_DIR, { recursive: true });
    const actor = randomUUID();
    await runtime.pool.query(`INSERT INTO public.users (id,username,password_hash,role,status)
      VALUES ($1,'demo','synthetic-test-value','superuser','active')`, [actor]);
    const active = randomUUID(), legacy = randomUUID(), retired = randomUUID(), unselected = randomUUID();
    const addr = (id: string) => "/uploads/collection-receipts/" + id + ".pdf";
    for (const id of [active, legacy, retired, unselected]) {
      await runtime.pool.query(`INSERT INTO public.collection_records
        (id, customer_name, ic_number, customer_phone, account_number, batch, payment_date,
         amount, receipt_file, created_by_login, collection_staff_nickname, staff_username,receipt_validation_status)
        VALUES ($1,'Fixture','IC-DEMO','-','DEMO','P10','2026-02-28',12.30,$2,'demo',$3,$3,'unverified')`,
      [id, addr(id), id === active ? "ORDINARY" : "DEMO"]);
    }
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "ascii");
    for (const id of [active, legacy]) await writeFile(path.join(COLLECTION_RECEIPT_DIR, id + ".pdf"), pdf);
    async function attach(id: string, storagePath: string, archived: boolean) {
      await runtime.pool.query(`INSERT INTO public.collection_record_receipts
        (id,collection_record_id,storage_path,original_file_name,original_mime_type,original_extension,file_size,deleted_at,receipt_amount)
        VALUES ($1,$2,$3,'Contoh.pdf','application/pdf','.pdf',$4,$5,1230)`,
      [randomUUID(), id, storagePath, pdf.length, archived ? new Date() : null]);
    }
    await attach(active, addr(active), false);
    await attach(active, addr(randomUUID()), true);
    await attach(retired, addr(retired), true);
    await attach(unselected, addr(unselected), false);
    // The selection query sees modern, historical and retired receipt metadata in the same snapshot.
    const request = { selectedRecordIds: [retired, legacy, active] };
    const before = await runtime.pool.query("SELECT * FROM public.collection_record_receipts ORDER BY id");
    const records = await listCollectionRecords(request);
    assert.deepEqual(new Set(records.map(r => r.id)), new Set(request.selectedRecordIds));
    const byId = new Map(records.map(r => [r.id, r]));
    assert.deepEqual(byId.get(active)?.receipts.map(r => r.storagePath), [addr(active)]);
    assert.deepEqual(byId.get(legacy)?.receipts.map(r => [r.storagePath, r.originalMimeType]), [[addr(legacy), "application/pdf"]]);
    assert.deepEqual(byId.get(retired)?.receipts, []);
    assert.equal(byId.get(retired)?.receiptFile, null);
    assert.equal(await listCollectionRecords({ selectedRecordIds: [] }).then(r => r.length), 0);
    assert.equal(await listCollectionRecords({ selectedRecordIds: [randomUUID()] }).then(r => r.length), 0);
    const again = await listCollectionRecords(request);
    assert.equal(again.find(r => r.id === legacy)?.receipts.length, 1);
    const after = await runtime.pool.query("SELECT * FROM public.collection_record_receipts ORDER BY id");
    assert.deepEqual(before.rows, after.rows);
    const { PostgresStorage } = await import("../../storage-postgres");
    const storage = new PostgresStorage();
    const filters = { nicknames: ["ORDINARY"], receiptValidationStatus: "unverified" as const };
    const ordinaryList = await storage.listCollectionRecords(filters);
    const ordinarySummary = await storage.summarizeCollectionRecords(filters);
    assert.deepEqual(ordinaryList.map(record => record.id), [active]);
    assert.deepEqual(ordinarySummary, { totalRecords: 1, totalAmount: 12.3 });

    await t.test("registered HTTP export streams the two real fixture receipts and persists disclosure audit", async subtest => {
      const { createJsonTestApp, startTestServer, stopTestServer, createTestAuthenticateToken, createTestRequireRole,
        createTestRequireTabAccess } = await import("../../routes/tests/http-test-utils");
      const { createCsrfProtectionMiddleware } = await import("../../http/csrf");
      const { registerCollectionOfflineExportRoute } = await import("../../routes/collection/collection-offline-export-route");
      const { createCollectionRouteContext } = await import("../../routes/collection/collection-route-shared");
      // Receiving the response body can precede the server's post-stream audit commit.
      const commits = new EventEmitter();
      let downloadedCommitted = false;
      const writeAudit = storage.createAuditLog.bind(storage);
      subtest.mock.method(storage, "createAuditLog", async (input: Parameters<typeof writeAudit>[0]) => {
        const saved = await writeAudit(input);
        if (input.action === "export_selected_offline" && JSON.parse(input.details ?? "{}").outcome === "downloaded") {
          downloadedCommitted = true;
          commits.emit("downloaded");
        }
        return saved;
      });
      const app = createJsonTestApp();
      app.use(createCsrfProtectionMiddleware());
      registerCollectionOfflineExportRoute(createCollectionRouteContext(app, {
        storage, authenticateToken: createTestAuthenticateToken({ userId: actor, role: "superuser", username: "demo" }),
        requireRole: createTestRequireRole(), requireTabAccess: createTestRequireTabAccess(),
      }));
      const { server, baseUrl } = await startTestServer(app);
      try {
        const token = "b".repeat(64);
        const exportUrl = baseUrl + "/api/collection/export-selected-offline";
        const recordIds = [legacy, retired, active];
        const post = (expected: { id: string; cents: number; receipts: number }[]) => fetch(exportUrl, {
          method: "POST", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json",
            "X-CSRF-Token": token, Cookie: "sqr_auth=synthetic; sqr_csrf=" + token },
          body: JSON.stringify({ recordIds, expected }),
        });
        const expected = recordIds.map(id => ({ id, cents: 1230, receipts: id === retired ? 0 : 1 }));
        const changed = await post([{ id: legacy, cents: 200, receipts: 0 }, ...expected.slice(1)]);
        assert.equal(changed.status, 409);
        assert.deepEqual((await changed.json()).error.details, { changes: [expected[0]] });
        const details = await fetch(exportUrl + "/records/" + legacy);
        assert.equal(details.status, 200);
        const body = await details.json();
        const { collectionRecordResponseSchema } = await import("../../../shared/api-contracts");
        assert.equal(collectionRecordResponseSchema.parse(body.record).receipts[0]?.storagePath, "/api/collection/" + legacy + "/receipt/view");
        assert.doesNotMatch(JSON.stringify(body), /uploads\/collection-receipts/);
        const response = await post(expected);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type") ?? "", /application\/zip/);
        const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
        const workbook = Object.keys(files).find(name => name.endsWith("/Collection_Selected.xlsx"))!;
        const book = XLSX.read(files[workbook], { type: "array" });
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets["Collection Records"]!);
        assert.deepEqual(rows.map(row => row["Record ID"]), [legacy, retired, active]);
        assert.deepEqual(rows.map(row => row.Resit), ["Amaun tidak direkodkan", "Tiada Resit", 12.30]);
        const index = book.Sheets["Receipt Index"]!;
        const indexed = XLSX.utils.sheet_to_json<Record<string, unknown>>(index);
        assert.deepEqual(indexed.map(row => row["Record ID"]), [legacy, active]);
        assert.deepEqual(indexed.map(row => row.Resit), ["Amaun tidak direkodkan", 12.30]);
        const root = path.posix.dirname(workbook) + "/";
        for (const address of ["G2", "G3"]) {
          const cell = index[address] as XLSX.CellObject | undefined;
          assert.ok(cell?.l);
          const target = cell.l.Target;
          assert.match(target, /^Receipts\/[\da-f-]+_01\.pdf$/);
          assert.deepEqual(Buffer.from(files[root + target]), pdf);
        }
        assert.equal(Object.keys(files).filter(name => name.endsWith(".pdf")).length, 2);
        if (!downloadedCommitted) {
          await once(commits, "downloaded", { signal: AbortSignal.timeout(15_000) });
        }
        const audit = await runtime.pool.query("SELECT details FROM public.audit_logs WHERE action='export_selected_offline' AND performed_by=$1", [actor]);
        const outcomes = audit.rows.map(row => JSON.parse(row.details).outcome);
        assert.deepEqual(outcomes.sort(), ["OFFLINE_EXPORT_SELECTION_CHANGED", "downloaded", "prepared"]);
      } finally {
        await stopTestServer(server);
      }
    });
    assert.deepEqual(await storage.listCollectionRecords(filters), ordinaryList);
    assert.deepEqual(await storage.summarizeCollectionRecords(filters), ordinarySummary);
    assert.deepEqual((await runtime.pool.query("SELECT * FROM public.collection_record_receipts ORDER BY id")).rows, before.rows);
  } finally {
    process.chdir(originalCwd);
    await runtime.closePostgresPools();
  }
});
