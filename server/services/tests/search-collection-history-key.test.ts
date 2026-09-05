import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeSearchCollectionHistoryKey,
  encodeSearchCollectionHistoryKey,
} from "../search-collection-history-key";

test("collection history keys round-trip without exposing source identifiers", () => {
  const identity = {
    sourceImportId: "import-private-1001",
    sourceDataRowId: "row-private-2002",
  };
  const key = encodeSearchCollectionHistoryKey(identity);

  assert.match(key, /^sch1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(key.includes(identity.sourceImportId), false);
  assert.equal(key.includes(identity.sourceDataRowId), false);
  assert.deepEqual(decodeSearchCollectionHistoryKey(key), identity);
});

test("collection history keys fail closed when ciphertext or tag is changed", () => {
  const key = encodeSearchCollectionHistoryKey({
    sourceImportId: "import-1",
    sourceDataRowId: "row-1",
  });
  const tamperEncodedBytes = (value: string) => {
    const bytes = Buffer.from(value, "base64url");
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    return bytes.toString("base64url");
  };
  const ciphertextParts = key.split(".");
  ciphertextParts[2] = tamperEncodedBytes(ciphertextParts[2] || "");
  const tagParts = key.split(".");
  tagParts[3] = tamperEncodedBytes(tagParts[3] || "");

  assert.equal(decodeSearchCollectionHistoryKey(ciphertextParts.join(".")), null);
  assert.equal(decodeSearchCollectionHistoryKey(tagParts.join(".")), null);
  assert.equal(decodeSearchCollectionHistoryKey("sch1.invalid"), null);
  assert.equal(decodeSearchCollectionHistoryKey("x".repeat(1_025)), null);
});

test("collection history keys reject missing and oversized identities", () => {
  assert.throws(
    () => encodeSearchCollectionHistoryKey({ sourceImportId: "", sourceDataRowId: "row-1" }),
    /valid source identity/i,
  );
  assert.throws(
    () => encodeSearchCollectionHistoryKey({
      sourceImportId: "import-1",
      sourceDataRowId: "x".repeat(201),
    }),
    /valid source identity/i,
  );
});
