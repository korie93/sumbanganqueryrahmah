import assert from "node:assert/strict";
import test from "node:test";
import { validateRuntimeEnvironmentSchema } from "../runtime-env-schema";

test("runtime env schema accepts a minimal local configuration", () => {
  assert.doesNotThrow(() => {
    validateRuntimeEnvironmentSchema({
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: "5000",
      BACKUP_FEATURE_ENABLED: "1",
      PG_MAX_CONNECTIONS: "10",
      AUTH_COOKIE_SECURE: "auto",
    });
  });
});

test("runtime env schema rejects malformed boolean flags", () => {
  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        BACKUP_FEATURE_ENABLED: "maybe",
      });
    },
    /BACKUP_FEATURE_ENABLED.*boolean flag/i,
  );
});

test("runtime env schema rejects malformed integer values", () => {
  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        PG_MAX_CONNECTIONS: "many",
      });
    },
    /PG_MAX_CONNECTIONS.*integer/i,
  );
});

test("runtime env schema rejects integer values outside configured bounds", () => {
  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        DEFAULT_VIEWER_ROWS_PER_PAGE: "999",
      });
    },
    /DEFAULT_VIEWER_ROWS_PER_PAGE.*at most 500/i,
  );
});

test("runtime env schema rejects backup payload limits below the minimum bound", () => {
  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        BACKUP_MAX_PAYLOAD_BYTES: "1024",
      });
    },
    /BACKUP_MAX_PAYLOAD_BYTES.*at least 1048576/i,
  );
});

test("runtime env schema preserves the existing AUTH_COOKIE_SECURE error contract", () => {
  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        AUTH_COOKIE_SECURE: "sometimes",
      });
    },
    /AUTH_COOKIE_SECURE must be one of: auto, true, false, 1, or 0/i,
  );
});

test("runtime env schema accepts staged collection PII retirement field lists when encryption is configured", () => {
  assert.doesNotThrow(() => {
    validateRuntimeEnvironmentSchema({
      COLLECTION_PII_ENCRYPTION_KEY: "collection-pii-active-key",
      COLLECTION_PII_RETIRED_FIELDS: "icNumber,customerPhone,accountNumber",
    });
  });
});

test("runtime env schema rejects unknown collection PII retirement fields", () => {
  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        COLLECTION_PII_RETIRED_FIELDS: "icNumber,unknownField",
      });
    },
    /COLLECTION_PII_RETIRED_FIELDS must contain only/i,
  );
});

test("runtime env schema rejects collection PII retirement fields without an active encryption key", () => {
  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        COLLECTION_PII_RETIRED_FIELDS: "icNumber,customerPhone,accountNumber",
      });
    },
    /COLLECTION_PII_ENCRYPTION_KEY is required when COLLECTION_PII_RETIRED_FIELDS is set/i,
  );
});

test("runtime env schema accepts collection PII retirement fields when the active encryption key is configured", () => {
  assert.doesNotThrow(() => {
    validateRuntimeEnvironmentSchema({
      COLLECTION_PII_ENCRYPTION_KEY: "collection-pii-active-key",
      COLLECTION_PII_RETIRED_FIELDS: "icNumber,customerPhone,accountNumber",
    });
  });
});
