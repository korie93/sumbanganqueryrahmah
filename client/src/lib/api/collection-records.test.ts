import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionMutationFingerprint,
  buildCollectionRecordFormData,
  createCollectionRecord,
  deleteCollectionRecord,
  getCollectionPurgeSummary,
  getCollectionRecords,
  purgeOldCollectionRecords,
  updateCollectionRecord,
} from "./collection-records";

test("buildCollectionRecordFormData appends scalar fields and repeated receipt ids", () => {
  const formData = buildCollectionRecordFormData({
    customerName: "Collector Test",
    amount: 55.3,
    removeReceipt: true,
    removeReceiptIds: ["receipt-1", "receipt-2"],
    expectedUpdatedAt: "2026-03-01T09:00:00.000Z",
    newReceiptMetadata: [{ receiptAmount: "55.30", extractionStatus: "suggested", receiptReference: "R-1" }],
    existingReceiptMetadata: [{ receiptId: "receipt-1", receiptAmount: "25.00", extractionStatus: "ambiguous" }],
  });

  assert.equal(formData.get("customerName"), "Collector Test");
  assert.equal(formData.get("amount"), "55.3");
  assert.equal(formData.get("removeReceipt"), "true");
  assert.deepEqual(formData.getAll("removeReceiptIds"), ["receipt-1", "receipt-2"]);
  assert.equal(formData.get("expectedUpdatedAt"), "2026-03-01T09:00:00.000Z");
  assert.equal(
    formData.get("newReceiptMetadata"),
    JSON.stringify([{ receiptAmount: "55.30", extractionStatus: "suggested", receiptReference: "R-1" }]),
  );
  assert.equal(
    formData.get("existingReceiptMetadata"),
    JSON.stringify([{ receiptId: "receipt-1", receiptAmount: "25.00", extractionStatus: "ambiguous" }]),
  );
});

test("buildCollectionRecordFormData appends receipt files for multipart uploads", () => {
  const file = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47])], "receipt.png", {
    type: "image/png",
  });

  const formData = buildCollectionRecordFormData({
    customerName: "Collector Test",
  }, [file]);

  const appendedFiles = formData.getAll("receipts");
  assert.equal(appendedFiles.length, 1);
  assert.equal((appendedFiles[0] as File).name, "receipt.png");
});

test("buildCollectionMutationFingerprint stays stable for the same logical payload", () => {
  const left = buildCollectionMutationFingerprint({
    operation: "update",
    recordId: "collection-1",
    payload: {
      amount: 10,
      customerName: "Alice",
      nested: {
        batch: "P10",
        paymentDate: "2026-03-24",
      },
    },
    receiptFiles: [
      {
        lastModified: 1,
        name: "receipt-a.png",
        size: 123,
        type: "image/png",
      },
    ],
  });
  const right = buildCollectionMutationFingerprint({
    operation: "update",
    recordId: "collection-1",
    payload: {
      customerName: "Alice",
      nested: {
        paymentDate: "2026-03-24",
        batch: "P10",
      },
      amount: 10,
    },
    receiptFiles: [
      {
        lastModified: 1,
        name: "receipt-a.png",
        size: 123,
        type: "image/png",
      },
    ],
  });

  assert.equal(left, right);
});

test("buildCollectionMutationFingerprint changes when receipt metadata changes", () => {
  const base = buildCollectionMutationFingerprint({
    operation: "create",
    payload: {
      customerName: "Alice",
      amount: 10,
    },
    receiptFiles: [
      {
        lastModified: 1,
        name: "receipt-a.png",
        size: 123,
        type: "image/png",
      },
    ],
  });
  const changed = buildCollectionMutationFingerprint({
    operation: "create",
    payload: {
      customerName: "Alice",
      amount: 10,
    },
    receiptFiles: [
      {
        lastModified: 1,
        name: "receipt-b.png",
        size: 123,
        type: "image/png",
      },
    ],
  });

  assert.notEqual(base, changed);
});

test("buildCollectionMutationFingerprint keeps multipart receipt headers below the backend limit", () => {
  const fingerprint = buildCollectionMutationFingerprint({
    operation: "create",
    payload: {
      accountNumber: "SMOKE-RCPT-1775610210015",
      amount: 12.34,
      batch: "ONLINE",
      collectionStaffNickname: "collection-smoke-staff",
      customerName: "Smoke Receipt 1775610210015",
      customerPhone: "0120210015",
      icNumber: "900101210015",
      newReceiptMetadata: [
        {
          fileHash: null,
          receiptAmount: "12.34",
          receiptDate: null,
          receiptId: null,
          receiptReference: null,
        },
      ],
      paymentDate: "2026-04-08",
    },
    receiptFiles: [
      {
        lastModified: 1775610210016,
        name: "receipt-smoke-save.png",
        size: 1000,
        type: "image/png",
      },
    ],
  });

  assert.doesNotThrow(() => JSON.parse(fingerprint));
  assert.ok(fingerprint.length <= 512);
});

function buildCollectionListPayload(overrides?: Record<string, unknown>) {
  return {
    ok: true,
    records: [],
    total: 0,
    totalAmount: 0,
    page: 1,
    pageSize: 5000,
    limit: 5000,
    offset: 0,
    nextCursor: null,
    pagination: {
      mode: "hybrid",
      page: 1,
      pageSize: 5000,
      total: 0,
      totalPages: 1,
      limit: 5000,
      offset: 0,
      nextCursor: null,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    ...overrides,
  };
}

function buildCollectionRecordPayload(overrides?: Record<string, unknown>) {
  return {
    id: "collection-1",
    customerName: "Alice Tan",
    icNumber: "900101015555",
    customerPhone: "0123456789",
    accountNumber: "ACC-1001",
    batch: "P25",
    paymentDate: "2026-03-24",
    amount: "120.50",
    receiptFile: null,
    receipts: [],
    receiptTotalAmount: "0.00",
    receiptValidationStatus: "needs_review",
    receiptValidationMessage: "Tiada resit dilampirkan untuk semakan jumlah.",
    receiptCount: 0,
    duplicateReceiptFlag: false,
    createdByLogin: "staff.user",
    collectionStaffNickname: "Collector Alpha",
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:00:00.000Z",
    ...overrides,
  };
}

test("getCollectionRecords accepts the backend maximum page size", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    JSON.stringify(buildCollectionListPayload()),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  )) as typeof fetch;

  try {
    const payload = await getCollectionRecords({ pageSize: 5000 });
    assert.equal(payload.pageSize, 5000);
    assert.equal(payload.pagination.limit, 5000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getCollectionRecords rejects malformed collection record payloads", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    JSON.stringify(buildCollectionListPayload({
      records: [{
        id: "collection-1",
        customerName: "Alice Tan",
        icNumber: "900101015555",
        customerPhone: "0123456789",
        accountNumber: "ACC-1001",
        batch: "UNSUPPORTED",
      }],
      total: 1,
      totalAmount: 120.5,
    })),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  )) as typeof fetch;

  try {
    await assert.rejects(
      getCollectionRecords(),
      /API contract mismatch for \/api\/collection\/list/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("collection mutation API wrappers validate create, update, and delete payloads", async () => {
  const requests: Array<{ method: string; url: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = String(init?.method || "GET");
    const url = String(input);
    requests.push({ method, url });

    const payload = method === "DELETE"
      ? { ok: true }
      : { ok: true, record: buildCollectionRecordPayload() };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const created = await createCollectionRecord({
      customerName: "Alice Tan",
      icNumber: "900101015555",
      customerPhone: "0123456789",
      accountNumber: "ACC-1001",
      sourceImportId: "import-1",
      agingBucket: "D3",
      batch: "P25",
      paymentDate: "2026-03-24",
      amount: 120.5,
      collectionStaffNickname: "Collector Alpha",
    });
    const updated = await updateCollectionRecord("collection-1", {
      amount: 99.25,
    });
    const deleted = await deleteCollectionRecord("collection-1");

    assert.equal(created.record.id, "collection-1");
    assert.equal(updated.record.collectionStaffNickname, "Collector Alpha");
    assert.equal(deleted.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests.map((request) => request.method), ["POST", "PATCH", "DELETE"]);
  assert.match(requests[0]?.url || "", /\/api\/collection$/);
  assert.match(requests[1]?.url || "", /\/api\/collection\/collection-1$/);
  assert.match(requests[2]?.url || "", /\/api\/collection\/collection-1$/);
});

test("collection mutation API wrappers reject malformed record responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = String(init?.method || "GET");
    const payload = method === "DELETE"
      ? { ok: false }
      : {
          ok: true,
          record: buildCollectionRecordPayload({
            createdAt: "not-a-datetime",
          }),
        };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      createCollectionRecord({
        customerName: "Alice Tan",
        icNumber: "900101015555",
        customerPhone: "0123456789",
        accountNumber: "ACC-1001",
        sourceImportId: "import-1",
        agingBucket: "D3",
        batch: "P25",
        paymentDate: "2026-03-24",
        amount: 120.5,
        collectionStaffNickname: "Collector Alpha",
      }),
      /API contract mismatch for \/api\/collection/,
    );
    await assert.rejects(
      updateCollectionRecord("collection-1", { amount: 99.25 }),
      /API contract mismatch for \/api\/collection\/:id/,
    );
    await assert.rejects(
      deleteCollectionRecord("collection-1"),
      /API contract mismatch for \/api\/collection\/:id/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("collection purge API wrappers validate summary and mutation responses", async () => {
  const requests: Array<{ method: string; body: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({
      method: String(init?.method || "GET"),
      body: typeof init?.body === "string" ? init.body : "",
    });
    const payload = url.endsWith("/purge-summary")
      ? {
          ok: true,
          retentionMonths: 6,
          cutoffDate: "2025-12-27",
          eligibleRecords: 2,
          totalAmount: 450.75,
        }
      : {
          ok: true,
          retentionMonths: 6,
          cutoffDate: "2025-12-27",
          deletedRecords: 2,
          totalAmount: 450.75,
        };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const summary = await getCollectionPurgeSummary();
    const purged = await purgeOldCollectionRecords("SuperSecret123");
    assert.equal(summary.eligibleRecords, 2);
    assert.equal(purged.deletedRecords, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests[0]?.method, "GET");
  assert.equal(requests[1]?.method, "DELETE");
  assert.deepEqual(JSON.parse(requests[1]?.body || "{}"), {
    currentPassword: "SuperSecret123",
  });
});

test("getCollectionPurgeSummary rejects malformed cutoff dates", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: true,
    retentionMonths: 6,
    cutoffDate: "27-12-2025",
    eligibleRecords: 2,
    totalAmount: 450.75,
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;

  try {
    await assert.rejects(
      getCollectionPurgeSummary(),
      /API contract mismatch for \/api\/collection\/purge-summary/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
