import assert from "node:assert/strict";
import test from "node:test";
import { fetchOfflineSelectionDetail, fetchSelectedCollectionOffline } from "@/lib/api/collection-records";
import { parseCollectionApiErrorDetails } from "@/pages/collection/utils";
import { getReceiptPreviewBinaryId } from "../utils";

const firstId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";

test("selected export sends ordered IDs, approved estimates, credentials and CSRF with a safe ZIP name", async (t) => {
  const expected = [{ id: firstId, cents: 150, receipts: 2 }, { id: otherId, cents: 30, receipts: 0 }];
  const documentBefore = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "sqr_csrf=test-value" } });
  t.after(() => {
    if (documentBefore) Object.defineProperty(globalThis, "document", documentBefore);
    else Reflect.deleteProperty(globalThis, "document");
  });
  const controller = new AbortController();
  const archive = new Uint8Array([80, 75, 3, 4]);
  t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    assert.equal(path, "/api/collection/export-selected-offline");
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "include");
    assert.equal(new Headers(init.headers).get("X-CSRF-Token"), "test-value");
    assert.deepEqual(JSON.parse(String(init.body)), { recordIds: [firstId, otherId], expected });
    assert.equal(init.signal, controller.signal);
    return new Response(archive, { headers: {
      "Content-Type": "application/zip", "Content-Disposition": "attachment; filename*=UTF-8''SQR_Collection_20261124.zip",
    } });
  });
  const result = await fetchSelectedCollectionOffline([firstId, otherId], controller.signal, expected);
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), archive);
  assert.equal(result.filename, "SQR_Collection_20261124.zip");
});

test("receipt detail loads only a valid record on demand using the authenticated GET and its AbortSignal", async (t) => {
  const controller = new AbortController();
  const fetch = t.mock.method(globalThis, "fetch", (path: string, init: RequestInit) => {
    assert.equal(path, `/api/collection/export-selected-offline/records/${firstId}`);
    assert.equal(init.method, "GET");
    assert.equal(init.credentials, "include");
    assert.equal(init.signal, controller.signal);
    return Response.json({ ok: false, message: "Forbidden" }, { status: 403 });
  });
  await assert.rejects(fetchOfflineSelectionDetail("../", controller.signal), /ID rekod tidak sah/);
  assert.equal(fetch.mock.callCount(), 0);
  await assert.rejects(fetchOfflineSelectionDetail(firstId, controller.signal), /^Error: 403:/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("only synthesized legacy detail receipts use the default receipt route for preview and download", () => {
  const defaultPath = `/api/collection/${firstId}/receipt/view`;
  assert.equal(getReceiptPreviewBinaryId(firstId, { id: firstId, storagePath: defaultPath }), undefined);
  assert.equal(getReceiptPreviewBinaryId(firstId, { id: firstId, storagePath: "uploads/receipt.pdf" }), firstId);
  assert.equal(getReceiptPreviewBinaryId(firstId, { id: otherId, storagePath: defaultPath }), otherId);
  assert.equal(getReceiptPreviewBinaryId(firstId, null), undefined);
});

test("an export response cannot choose a path or another download extension", async (t) => {
  let suggested = "../private.zip";
  t.mock.method(globalThis, "fetch", async () => new Response(new Uint8Array([80, 75, 3, 4]), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${suggested}"` },
  }));
  for (const name of ["../private.zip", "export.zip.html", "C:\\private.zip", "archive.zip.exe", ".zip"]) {
    suggested = name;
    assert.equal((await fetchSelectedCollectionOffline([firstId], new AbortController().signal)).filename, "SQR_Collection_Selected.zip");
  }
});

test("an HTML login response, empty ZIP, or mislabeled ZIP is rejected before a download", async (t) => {
  let mime = "text/html";
  let content: string | null = "<html />";
  t.mock.method(globalThis, "fetch", async () => new Response(content, { headers: { "Content-Type": mime } }));
  await assert.rejects(fetchSelectedCollectionOffline([firstId], new AbortController().signal), /Respons ZIP tidak sah/);
  mime = "application/zip";
  content = null;
  await assert.rejects(fetchSelectedCollectionOffline([firstId], new AbortController().signal), /Fail ZIP kosong/);
  content = "<html />";
  await assert.rejects(fetchSelectedCollectionOffline([firstId], new AbortController().signal), /Kandungan fail ZIP tidak sah/);
});

test("permission, size and unavailable record responses retain structured error details", async (t) => {
  const message = "Ujian";
  const responses = [
    { status: 409, error: { code: "OFFLINE_EXPORT_RECORDS_UNAVAILABLE", message, details: { unavailableIds: [firstId] } } },
    { status: 403, error: { code: "FORBIDDEN", message } },
    { status: 413, error: { code: "PAYLOAD_TOO_LARGE", message } },
  ];
  for (const response of responses) {
    const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ ok: false, message, error: response.error }, { status: response.status }));
    await assert.rejects(fetchSelectedCollectionOffline([firstId], new AbortController().signal), (error) => {
      const parsed = parseCollectionApiErrorDetails(error);
      assert.equal(parsed.status, response.status);
      if (response.status === 409) {
        assert.equal(parsed.code, "OFFLINE_EXPORT_RECORDS_UNAVAILABLE");
        assert.deepEqual(parsed.details, { unavailableIds: [firstId] });
      }
      return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});

test("cancelling the export aborts the original request without automatic resubmission", async (t) => {
  const controller = new AbortController();
  const fetch = t.mock.method(globalThis, "fetch", (_path: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    assert.equal(init.signal, controller.signal);
    controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
    controller.abort();
  }));
  await assert.rejects(fetchSelectedCollectionOffline([firstId], controller.signal), { name: "AbortError" });
  assert.equal(fetch.mock.callCount(), 1);
});
