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
