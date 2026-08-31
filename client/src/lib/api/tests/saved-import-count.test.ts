import assert from "node:assert/strict";
import test from "node:test";
import {
  resetApiRetryStateForTests,
} from "@/lib/api-client";
import {
  createImport,
  deleteImport,
  getSavedImportCount,
  SAVED_IMPORTS_CHANGED_EVENT,
} from "@/lib/api/imports";

function replaceGlobalFetch(mock: typeof fetch) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function installWindowEventTarget(eventTarget: EventTarget) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: eventTarget,
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "window", originalDescriptor);
      return;
    }
    Reflect.deleteProperty(globalThis, "window");
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("saved import count probe performs a single request when rate limited", async () => {
  let requestCount = 0;
  resetApiRetryStateForTests();
  const restoreFetch = replaceGlobalFetch((async () => {
    requestCount += 1;
    return jsonResponse({ message: "Too many requests." }, 429);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => getSavedImportCount(),
      /429/,
    );
    assert.equal(requestCount, 1);
  } finally {
    restoreFetch();
    resetApiRetryStateForTests();
  }
});

test("successful saved import create and delete mutations publish count refresh events", async () => {
  const eventTarget = new EventTarget();
  let eventCount = 0;
  const restoreWindow = installWindowEventTarget(eventTarget);
  const restoreFetch = replaceGlobalFetch((async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();

    if (url === "/api/imports" && method === "POST") {
      return jsonResponse({
        id: "import-123",
        name: "Sample Import",
        filename: "sample.csv",
        createdAt: "2026-08-30T00:00:00.000Z",
        isDeleted: false,
        createdBy: "superuser",
        rowCount: 1,
      });
    }
    if (url === "/api/imports/import-123" && method === "DELETE") {
      return jsonResponse({ ok: true, success: true });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  }) as typeof fetch);
  eventTarget.addEventListener(SAVED_IMPORTS_CHANGED_EVENT, () => {
    eventCount += 1;
  });

  try {
    await createImport("Sample Import", "sample.csv", [{ name: "Sample" }]);
    await deleteImport("import-123");
    assert.equal(eventCount, 2);
  } finally {
    restoreFetch();
    restoreWindow();
  }
});
