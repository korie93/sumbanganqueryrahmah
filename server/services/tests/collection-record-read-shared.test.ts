import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionPaginationMeta,
  encodeCollectionListCursor,
  parseCollectionBooleanQueryValue,
  parseCollectionListCursor,
  parseCollectionReceiptValidationFilter,
} from "../collection/collection-record-read-shared";

test("collection record read shared cursor helpers round-trip valid offsets and reject invalid values", () => {
  const encoded = encodeCollectionListCursor({ offset: 150 });
  assert.deepEqual(parseCollectionListCursor(encoded), { offset: 150 });
  assert.equal(parseCollectionListCursor("not-base64"), null);
  const invalidOffset = Buffer.from(JSON.stringify({ offset: -5 }), "utf8").toString("base64url");
  assert.equal(parseCollectionListCursor(invalidOffset), null);
});

test("collection record read shared helpers normalize booleans, validation filters, and pagination", () => {
  assert.equal(parseCollectionBooleanQueryValue("yes"), true);
  assert.equal(parseCollectionBooleanQueryValue("all"), false);
  assert.equal(parseCollectionBooleanQueryValue("maybe"), undefined);
  assert.equal(parseCollectionReceiptValidationFilter("matched"), "matched");
  assert.equal(parseCollectionReceiptValidationFilter("ALL"), undefined);
  assert.equal(parseCollectionReceiptValidationFilter("unexpected"), undefined);
  assert.deepEqual(
    buildCollectionPaginationMeta({
      page: 2,
      pageSize: 25,
      total: 101,
      offset: 25,
      nextCursor: "next-cursor",
    }),
    {
      page: 2,
      pageSize: 25,
      total: 101,
      totalPages: 5,
      limit: 25,
      offset: 25,
      nextCursor: "next-cursor",
      hasNextPage: true,
      hasPreviousPage: true,
    },
  );
});
