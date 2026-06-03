import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { apiErrorPayloadSchema } from "../../../shared/api-contracts";
import { ERROR_CODES } from "../../../shared/error-codes";
import { HttpError, badRequest } from "../../http/errors";
import { createErrorHandler, errorHandler } from "../error-handler";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";

function expectApiError(message: string, code: string, options?: {
  details?: unknown;
  requestId?: string;
}) {
  return {
    ok: false,
    message,
    code,
    ...(options?.requestId ? { requestId: options.requestId } : {}),
    error: {
      code,
      message,
      ...(options?.details !== undefined ? { details: options.details } : {}),
      ...(options?.requestId ? { requestId: options.requestId } : {}),
    },
  };
}

test("errorHandler returns structured details for exposed HttpError instances", async () => {
  const app = express();
  app.get("/bad-request", () => {
    throw badRequest("Invalid receipt payload.", "INVALID_RECEIPT", { field: "receipt" });
  });
  app.use(errorHandler);

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/bad-request`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.doesNotThrow(() => apiErrorPayloadSchema.parse(payload));
    assert.deepEqual(payload, expectApiError("Invalid receipt payload.", "INVALID_RECEIPT", {
      details: { field: "receipt" },
    }));
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler redacts sensitive exposed HttpError detail fields", async () => {
  const app = express();
  app.get("/bad-request-sensitive-details", () => {
    throw badRequest("Invalid request.", "INVALID_REQUEST", {
      field: "receipt",
      PG_PASSWORD: "sqr-secret-password",
      encodedConnectionString: "postgres%3A%2F%2Fsqr%3Asqr-secret%40db.internal%2Fsqr_db",
      htmlEncodedBearer: "Bearer&#32;eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret",
      nested: {
        stack: "Error: leaked stack\n    at /srv/app/server.ts:1:1",
        connectionString: "postgresql://sqr:sqr-secret@db.internal/sqr_db",
        retryable: true,
      },
    });
  });
  app.use(errorHandler);

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/bad-request-sensitive-details`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(payload.error.details, {
      field: "receipt",
      PG_PASSWORD: "[redacted]",
      encodedConnectionString: "[redacted]",
      htmlEncodedBearer: "[redacted]",
      nested: {
        stack: "[redacted]",
        connectionString: "[redacted]",
        retryable: true,
      },
    });
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler blocks encoded sensitive production response content", async () => {
  const app = express();
  app.get("/encoded-sensitive-error", () => {
    throw badRequest(
      "DATABASE_URL%3Dpostgres%3A%2F%2Fsqr%3Asecret%40db.internal%2Fsqr",
      "INVALID_REQUEST",
      {
        nested: {
          tokenHint: "Bearer&#32;eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret",
        },
      },
    );
  });
  app.use(createErrorHandler({ productionLike: true }));

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/encoded-sensitive-error`);
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    assert.equal(response.status, 400);
    assert.doesNotThrow(() => apiErrorPayloadSchema.parse(payload));
    assert.deepEqual(payload, expectApiError("Invalid request.", "INVALID_REQUEST"));
    assert.equal(serialized.includes("DATABASE_URL"), false);
    assert.equal(serialized.includes("Bearer"), false);
    assert.equal(serialized.includes("postgres"), false);
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler tolerates invalid encoded entity probes while sanitizing details", async () => {
  const app = express();
  app.get("/invalid-entity-probe", () => {
    throw badRequest("Invalid request.", "INVALID_REQUEST", {
      harmlessProbe: "&#9999999;",
      encodedConnectionString: "postgres%3A%2F%2Fsqr%3Asqr-secret%40db.internal%2Fsqr_db",
    });
  });
  app.use(errorHandler);

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/invalid-entity-probe`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(payload.error.details, {
      harmlessProbe: "&#9999999;",
      encodedConnectionString: "[redacted]",
    });
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler bounds exposed detail arrays and object keys", async () => {
  const app = express();
  app.get("/wide-details", () => {
    throw badRequest("Invalid request.", "INVALID_REQUEST", {
      values: Array.from({ length: 25 }, (_value, index) => index),
      wideObject: Object.fromEntries(
        Array.from({ length: 45 }, (_value, index) => [`key${index}`, index]),
      ),
    });
  });
  app.use(errorHandler);

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/wide-details`);
    const payload = await response.json();
    const details = payload.error.details as {
      values: number[];
      wideObject: Record<string, unknown>;
    };

    assert.equal(response.status, 400);
    assert.equal(details.values.length, 20);
    assert.equal(details.values.includes(24), false);
    assert.equal(Object.keys(details.wideObject).filter((key) => key.startsWith("key")).length, 40);
    assert.equal(details.wideObject.key40, undefined);
    assert.equal(details.wideObject.truncated, true);
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler does not expose hidden HttpError details", async () => {
  const app = express();
  app.get("/hidden-error", () => {
    throw new HttpError(503, "Database connection string leaked here.", {
      code: "DATABASE_DOWN",
      expose: false,
    });
  });
  app.use(errorHandler);

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/hidden-error`);
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.doesNotThrow(() => apiErrorPayloadSchema.parse(payload));
    assert.deepEqual(payload, expectApiError("Internal server error", "SERVICE_UNAVAILABLE"));
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler normalizes body parser payload-too-large errors", async () => {
  const app = express();
  app.get("/too-large", () => {
    throw Object.assign(new Error("request entity too large"), {
      status: 413,
      type: "entity.too.large",
    });
  });
  app.use(errorHandler);

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/too-large`);
    const payload = await response.json();

    assert.equal(response.status, 413);
    assert.doesNotThrow(() => apiErrorPayloadSchema.parse(payload));
    assert.deepEqual(payload, expectApiError(
      "The request payload is too large to process.",
      ERROR_CODES.PAYLOAD_TOO_LARGE,
    ));
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler includes request ids on payload-too-large errors", async () => {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader("x-request-id", "req-large-payload-1");
    next();
  });
  app.get("/too-large-with-request-id", () => {
    throw Object.assign(new Error("request entity too large"), {
      status: 413,
      type: "entity.too.large",
    });
  });
  app.use(errorHandler);

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/too-large-with-request-id`);
    const payload = await response.json();

    assert.equal(response.status, 413);
    assert.deepEqual(payload, expectApiError(
      "The request payload is too large to process.",
      ERROR_CODES.PAYLOAD_TOO_LARGE,
      { requestId: "req-large-payload-1" },
    ));
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler includes the active request id when the pipeline already assigned one", async () => {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader("x-request-id", "req-correlation-123");
    next();
  });
  app.get("/hidden-error-with-request-id", () => {
    throw new HttpError(500, "Sensitive database detail.", {
      code: "INTERNAL_FAILURE",
      expose: false,
    });
  });
  app.use(errorHandler);

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/hidden-error-with-request-id`);
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.doesNotThrow(() => apiErrorPayloadSchema.parse(payload));
    assert.deepEqual(payload, expectApiError("Internal server error", "INTERNAL_ERROR", {
      requestId: "req-correlation-123",
    }));
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler sanitizes request ids before returning error payloads", async () => {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader("x-request-id", "api-<script>|bad id/123");
    next();
  });
  app.get("/hidden-error-with-unsafe-request-id", () => {
    throw new HttpError(500, "Sensitive database detail.", {
      code: "INTERNAL_FAILURE",
      expose: false,
    });
  });
  app.use(errorHandler);

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/hidden-error-with-unsafe-request-id`);
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.doesNotThrow(() => apiErrorPayloadSchema.parse(payload));
    assert.equal(payload.requestId, "api-scriptbadid123");
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler replaces production exposed SQL errors with a generic response", async () => {
  const app = express();
  app.get("/bad-query", () => {
    throw badRequest("SELECT password FROM users WHERE id = 1", "QUERY_REJECTED");
  });
  app.use(createErrorHandler({ productionLike: true }));

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/bad-query`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.doesNotThrow(() => apiErrorPayloadSchema.parse(payload));
    assert.deepEqual(payload, expectApiError("Invalid request.", "QUERY_REJECTED"));
    assert.equal(JSON.stringify(payload).includes("SELECT password"), false);
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler strips production exposed stack and file path details", async () => {
  const app = express();
  app.get("/bad-stack", () => {
    throw badRequest("Invalid request.", "STACK_REJECTED", {
      stack: "Error: leaked\n    at handler (C:\\srv\\app\\server\\routes\\secret.ts:12:4)",
      filePath: "/var/www/sqr/server/routes/secret.ts",
      retryable: false,
    });
  });
  app.use(createErrorHandler({ productionLike: true }));

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/bad-stack`);
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    assert.equal(response.status, 400);
    assert.doesNotThrow(() => apiErrorPayloadSchema.parse(payload));
    assert.deepEqual(payload, expectApiError("Invalid request.", "STACK_REJECTED"));
    assert.equal(serialized.includes("secret.ts"), false);
    assert.equal(serialized.includes("/var/www"), false);
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler detects deeply nested sensitive production details", async () => {
  const app = express();
  const deeplyNested = Array.from({ length: 12 }).reduceRight<Record<string, unknown>>(
    (nested, _value, index) => ({ [`level${index}`]: nested }),
    { connectionString: "postgresql://sqr:sqr-secret@db.internal/sqr_db" },
  );

  app.get("/deep-sensitive-details", () => {
    throw badRequest("Invalid request.", "INVALID_REQUEST", deeplyNested);
  });
  app.use(createErrorHandler({ productionLike: true }));

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/deep-sensitive-details`);
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    assert.equal(response.status, 400);
    assert.doesNotThrow(() => apiErrorPayloadSchema.parse(payload));
    assert.deepEqual(payload, expectApiError("Invalid request.", "INVALID_REQUEST"));
    assert.equal(serialized.includes("postgresql://"), false);
    assert.equal(serialized.includes("connectionString"), false);
  } finally {
    await stopTestServer(server);
  }
});

test("errorHandler keeps detailed exposed messages outside production-like mode", async () => {
  const app = express();
  app.get("/dev-query", () => {
    throw badRequest("SELECT name FROM users WHERE id = 1", "QUERY_REJECTED");
  });
  app.use(createErrorHandler({ productionLike: false }));

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/dev-query`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(payload, expectApiError("SELECT name FROM users WHERE id = 1", "QUERY_REJECTED"));
  } finally {
    await stopTestServer(server);
  }
});
