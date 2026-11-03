import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPublicAuthExpiry,
  getPublicAuthTokenFromLocation,
  isPublicAuthAbortError,
  isTemporaryPublicAuthRequestError,
} from "@/pages/public-auth-runtime-utils";

test("getPublicAuthTokenFromLocation extracts the token query param safely", () => {
  assert.equal(getPublicAuthTokenFromLocation("?token=abc123"), "abc123");
  assert.equal(getPublicAuthTokenFromLocation("?other=value"), "");
  assert.equal(getPublicAuthTokenFromLocation(""), "");
});

test("formatPublicAuthExpiry keeps DB timestamps readable in the operational timezone", () => {
  assert.equal(formatPublicAuthExpiry("2026-04-12T04:30:00"), "12/04/2026, 12:30");
});

test("isPublicAuthAbortError only accepts abort-shaped errors", () => {
  assert.equal(isPublicAuthAbortError(new DOMException("aborted", "AbortError")), true);
  const namedError = new Error("aborted");
  namedError.name = "AbortError";
  assert.equal(isPublicAuthAbortError(namedError), true);
  assert.equal(isPublicAuthAbortError(new Error("boom")), false);
});

test("isTemporaryPublicAuthRequestError recognizes temporary HTTP statuses and known transient codes", () => {
  for (const status of [408, 500, 502, 503, 504]) {
    for (const error of [
      new Error(`${status}: ${JSON.stringify({ message: "Request could not be completed" })}`),
      { status },
      Object.assign(new Error("Request could not be completed"), { status }),
    ]) {
      assert.equal(isTemporaryPublicAuthRequestError(error), true, `status ${status}`);
    }
  }

  for (const [status, code] of [
    [500, "INTERNAL_ERROR"],
    [500, "INTERNAL_FAILURE"],
    [503, "DATABASE_DOWN"],
    [503, "SERVICE_UNAVAILABLE"],
    [408, "REQUEST_TIMEOUT"],
  ] as const) {
    for (const payload of [{ code }, { error: { code } }]) {
      assert.equal(
        isTemporaryPublicAuthRequestError(new Error(`${status}: ${JSON.stringify(payload)}`)),
        true,
        code,
      );
    }
    assert.equal(isTemporaryPublicAuthRequestError({ status, code }), true, code);
  }
});

test("isTemporaryPublicAuthRequestError preserves HTTP and application error denials", () => {
  for (const status of [400, 401, 403, 404, 409, 422, 429, 501, 505, 599]) {
    for (const error of [
      new Error(`${status}: ${JSON.stringify({ message: "Failed to fetch" })}`),
      Object.assign(new TypeError("Failed to fetch"), { status }),
      { status, code: "SERVICE_UNAVAILABLE", message: "Failed to fetch" },
    ]) {
      assert.equal(isTemporaryPublicAuthRequestError(error), false, `status ${status}`);
    }
  }

  for (const code of [
    "",
    "UNAUTHORIZED",
    "INVALID_CREDENTIALS",
    "TOKEN_EXPIRED",
    "RATE_LIMITED",
    "AUTH_RECOVERY_RATE_LIMITED",
    "REQUEST_BODY_INVALID",
    "MAINTENANCE_ACTIVE",
    "INTERNAL_SERVER_ERROR",
    "GATEWAY_TIMEOUT",
    "UNKNOWN_ERROR",
  ]) {
    for (const payload of [
      { code, message: "Failed to fetch" },
      { error: { code, message: "Failed to fetch" } },
    ]) {
      assert.equal(
        isTemporaryPublicAuthRequestError(new Error(`503: ${JSON.stringify(payload)}`)),
        false,
        code,
      );
    }
    assert.equal(
      isTemporaryPublicAuthRequestError(Object.assign(new TypeError("Failed to fetch"), { status: 503, code })),
      false,
      code,
    );
    assert.equal(isTemporaryPublicAuthRequestError({ status: 503, code }), false, code);
  }
});

test("isTemporaryPublicAuthRequestError recognizes native network, offline, and timeout failures", () => {
  for (const message of [
    "Failed to fetch",
    "fetch failed",
    "Network request failed",
    "Load failed",
    "NetworkError when attempting to fetch resource.",
  ]) {
    for (const error of [new Error(message), new TypeError(message)]) {
      assert.equal(isTemporaryPublicAuthRequestError(error), true, message);
    }
  }

  for (const error of [
    new Error("You appear to be offline. Check your internet connection and try again."),
    new Error("Request timed out after 60000ms: POST /api/auth/request-password-reset"),
    new DOMException("A network error occurred.", "NetworkError"),
    new DOMException("The operation timed out.", "TimeoutError"),
  ]) {
    assert.equal(isTemporaryPublicAuthRequestError(error), true, error.message);
  }
});

test("isTemporaryPublicAuthRequestError rejects aborts, programming errors, and unsupported inputs", () => {
  const namedAbort = new Error("Failed to fetch");
  namedAbort.name = "AbortError";

  for (const error of [
    new DOMException("Failed to fetch", "AbortError"),
    namedAbort,
    new TypeError("Cannot read properties of undefined (reading 'fetch')"),
    new SyntaxError("Failed to fetch"),
    new RangeError("Failed to fetch"),
    new SyntaxError("Unexpected token in JSON"),
    new Error("NetworkError"),
    new Error("Invalid response schema"),
    new Error("Something went wrong"),
    new Error("The request failed while trying to fetch a record"),
    { message: "Failed to fetch" },
    { name: "NetworkError", message: "A network error occurred." },
    "Failed to fetch",
    null,
    undefined,
    503,
    false,
    [],
  ]) {
    assert.equal(isTemporaryPublicAuthRequestError(error), false);
  }
});

test("isTemporaryPublicAuthRequestError safely rejects errors with throwing properties", () => {
  for (const property of ["status", "code", "message"]) {
    const error = Object.defineProperty(new Error("Failed to fetch"), property, {
      get() {
        throw new Error(`Cannot read ${property}`);
      },
    });

    assert.equal(isTemporaryPublicAuthRequestError(error), false, property);
  }
});
