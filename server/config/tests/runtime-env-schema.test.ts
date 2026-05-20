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

test("runtime env schema accepts DATABASE_URL-only database configuration", () => {
  assert.doesNotThrow(() => {
    validateRuntimeEnvironmentSchema({
      DATABASE_URL: "postgres://postgres:password@127.0.0.1:5432/sqr_db",
      BACKUP_FEATURE_ENABLED: "1",
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

test("runtime env schema validates CSV import row limits", () => {
  assert.doesNotThrow(() => {
    validateRuntimeEnvironmentSchema({
      IMPORT_CSV_MAX_ROWS: "100000",
    });
  });

  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        IMPORT_CSV_MAX_ROWS: "0",
      });
    },
    /IMPORT_CSV_MAX_ROWS.*at least 1/i,
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

test("runtime env schema validates SESSION_COOKIE_SAMESITE values", () => {
  assert.doesNotThrow(() => {
    validateRuntimeEnvironmentSchema({
      SESSION_COOKIE_SAMESITE: "strict",
    });
    validateRuntimeEnvironmentSchema({
      SESSION_COOKIE_SAMESITE: "lax",
    });
  });

  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        SESSION_COOKIE_SAMESITE: "none",
      });
    },
    /SESSION_COOKIE_SAMESITE must be one of: strict or lax/i,
  );
});

test("runtime env schema validates HSTS preload tuning flags", () => {
  assert.doesNotThrow(() => {
    validateRuntimeEnvironmentSchema({
      HSTS_MAX_AGE_SECONDS: "31536000",
      HSTS_PRELOAD_ENABLED: "0",
    });
  });

  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        HSTS_MAX_AGE_SECONDS: "-1",
      });
    },
    /HSTS_MAX_AGE_SECONDS.*at least 0/i,
  );

  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        HSTS_PRELOAD_ENABLED: "maybe",
      });
    },
    /HSTS_PRELOAD_ENABLED.*boolean flag/i,
  );
});

test("runtime env schema validates staged shared rate-limit store configuration keys", () => {
  assert.doesNotThrow(() => {
    validateRuntimeEnvironmentSchema({
      SQR_RATE_LIMIT_STORE: "memory",
    });
    validateRuntimeEnvironmentSchema({
      SQR_RATE_LIMIT_STORE: "redis",
      SQR_REDIS_RATE_LIMIT_URL: "rediss://redis.internal:6380/0",
    });
  });

  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        SQR_RATE_LIMIT_STORE: "memcached",
      });
    },
    /SQR_RATE_LIMIT_STORE must be one of: memory or redis/i,
  );
});

test("runtime env schema validates staged database bootstrap modes", () => {
  assert.doesNotThrow(() => {
    validateRuntimeEnvironmentSchema({
      SQR_DB_BOOTSTRAP_MODE: "runtime",
    });
    validateRuntimeEnvironmentSchema({
      SQR_DB_BOOTSTRAP_MODE: "migration",
    });
  });

  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        SQR_DB_BOOTSTRAP_MODE: "disabled",
      });
    },
    /SQR_DB_BOOTSTRAP_MODE must be one of: runtime or migration/i,
  );
});

test("runtime env schema validates production runtime bootstrap override flag", () => {
  assert.doesNotThrow(() => {
    validateRuntimeEnvironmentSchema({
      SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION: "0",
    });
    validateRuntimeEnvironmentSchema({
      SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION: "1",
    });
  });

  assert.throws(
    () => {
      validateRuntimeEnvironmentSchema({
        SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION: "sometimes",
      });
    },
    /SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION.*boolean flag/i,
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
