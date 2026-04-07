import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
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

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
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

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
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

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "The request payload is too large to process.",
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "The request payload is too large to process.",
      },
    });
  } finally {
    await stopTestServer(server);
  }
});
