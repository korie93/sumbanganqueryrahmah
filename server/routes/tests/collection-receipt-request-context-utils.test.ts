import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedRequest } from "../../auth/guards";
import type { PostgresStorage } from "../../storage-postgres";
import { resolveCollectionReceiptRequestContext } from "../collection-receipt-request-context-utils";

const testRecord = {
  id: "collection-1",
  collectionStaffNickname: "Collector Alpha",
  createdByLogin: "superuser",
};

function createRequest(params: Record<string, unknown>): AuthenticatedRequest {
  return {
    params,
    user: {
      id: "superuser-1",
      role: "superuser",
      username: "superuser",
    },
  } as unknown as AuthenticatedRequest;
}

function createStorage(getRecordCalls: string[] = []): PostgresStorage {
  return {
    getCollectionRecordById: async (id: string) => {
      getRecordCalls.push(id);
      return id === testRecord.id ? testRecord : null;
    },
  } as unknown as PostgresStorage;
}

test("resolveCollectionReceiptRequestContext trims and validates collection route id before storage lookup", async () => {
  const getRecordCalls: string[] = [];
  const result = await resolveCollectionReceiptRequestContext(
    createStorage(getRecordCalls),
    createRequest({ id: " collection-1 " }),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(getRecordCalls, ["collection-1"]);
  if (result.ok) {
    assert.equal(result.requestedReceiptId, null);
  }
});

test("resolveCollectionReceiptRequestContext rejects multi-value collection ids before storage lookup", async () => {
  const getRecordCalls: string[] = [];
  const result = await resolveCollectionReceiptRequestContext(
    createStorage(getRecordCalls),
    createRequest({ id: ["collection-1", "collection-2"] }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(getRecordCalls, []);
  if (!result.ok) {
    assert.equal(result.statusCode, 400);
    assert.equal(result.reason, "invalid_collection_id");
  }
});

test("resolveCollectionReceiptRequestContext rejects missing collection ids before storage lookup", async () => {
  const getRecordCalls: string[] = [];
  const result = await resolveCollectionReceiptRequestContext(
    createStorage(getRecordCalls),
    createRequest({ id: "" }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(getRecordCalls, []);
  if (!result.ok) {
    assert.equal(result.statusCode, 400);
    assert.equal(result.reason, "invalid_collection_id");
  }
});

test("resolveCollectionReceiptRequestContext validates receipt route id after record access is confirmed", async () => {
  const result = await resolveCollectionReceiptRequestContext(
    createStorage(),
    createRequest({ id: "collection-1", receiptId: ["receipt-1", "receipt-2"] }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.statusCode, 400);
    assert.equal(result.reason, "invalid_receipt_id");
  }
});

test("resolveCollectionReceiptRequestContext trims valid receipt route ids", async () => {
  const result = await resolveCollectionReceiptRequestContext(
    createStorage(),
    createRequest({ id: "collection-1", receiptId: " receipt-1 " }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.requestedReceiptId, "receipt-1");
  }
});
