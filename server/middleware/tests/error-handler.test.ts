import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { apiErrorPayloadSchema } from "../../../shared/api-contracts";
import { ERROR_CODES } from "../../../shared/error-codes";
import { HttpError, badRequest } from "../../http/errors";
import { errorHandler } from "../error-handler";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";

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
    assert.deepEqual(payload, {
      ok: false,
      message: "Invalid receipt payload.",
      error: {
        code: "INVALID_RECEIPT",
        message: "Invalid receipt payload.",
        details: { field: "receipt" },
      },
    });
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
    assert.deepEqual(payload, {
      ok: false,
      message: "Internal server error",
    });
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
    assert.deepEqual(payload, {
      ok: false,
      message: "The request payload is too large to process.",
      error: {
        code: ERROR_CODES.PAYLOAD_TOO_LARGE,
        message: "The request payload is too large to process.",
      },
    });
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
    assert.deepEqual(payload, {
      ok: false,
      message: "Internal server error",
      requestId: "req-correlation-123",
    });
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
