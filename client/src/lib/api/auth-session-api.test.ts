import assert from "node:assert/strict";
import test from "node:test";
import { login } from "./auth-session-api";

function withMockFetch(mock: typeof fetch): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("login reports a friendly message when the proxy returns an HTML 502 page", async () => {
  const restoreFetch = withMockFetch((async () => new Response(
    "<html><body><h1>502 Bad Gateway</h1></body></html>",
    {
      status: 502,
      statusText: "Bad Gateway",
      headers: {
        "Content-Type": "text/html",
        "x-request-id": "proxy-502",
      },
    },
  )) as typeof fetch);

  try {
    await assert.rejects(
      () => login("korie", "secret"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Server sedang tidak tersedia. Sila cuba sebentar lagi.");
        assert.equal((error as { status?: number }).status, 502);
        assert.equal((error as { requestId?: string | null }).requestId, "proxy-502");
        return true;
      },
    );
  } finally {
    restoreFetch();
  }
});
