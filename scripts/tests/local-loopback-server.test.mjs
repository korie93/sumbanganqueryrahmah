import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import {
  buildLoopbackBaseUrl,
  isLoopbackBaseUrl,
  resolveAvailableLoopbackPort,
  resolveManagedLoopbackBaseUrl,
} from "../lib/local-loopback-server.mjs";

test("isLoopbackBaseUrl recognizes loopback URLs only", () => {
  assert.equal(isLoopbackBaseUrl("http://127.0.0.1:5000"), true);
  assert.equal(isLoopbackBaseUrl("http://localhost:5000"), true);
  assert.equal(isLoopbackBaseUrl("https://sqr-system.com"), false);
});

test("buildLoopbackBaseUrl returns a stable local URL", () => {
  assert.equal(buildLoopbackBaseUrl({ host: "127.0.0.1", port: 5050 }), "http://127.0.0.1:5050");
});

test("resolveManagedLoopbackBaseUrl keeps explicit external URLs unchanged", async () => {
  const resolved = await resolveManagedLoopbackBaseUrl({
    configuredBaseUrl: "https://sqr-system.com",
    host: "127.0.0.1",
    preferredPort: 5000,
  });

  assert.deepEqual(resolved, {
    baseUrl: "https://sqr-system.com",
    host: "127.0.0.1",
    port: 5000,
    usedFallbackPort: false,
  });
});

test("resolveAvailableLoopbackPort skips a busy preferred port", async () => {
  const occupiedServer = net.createServer();
  await new Promise((resolve, reject) => {
    occupiedServer.once("error", reject);
    occupiedServer.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = occupiedServer.address();
    assert(address && typeof address === "object");
    const occupiedPort = address.port;

    const resolvedPort = await resolveAvailableLoopbackPort({
      host: "127.0.0.1",
      preferredPort: occupiedPort,
      maxAttempts: 5,
    });

    assert.notEqual(resolvedPort, occupiedPort);
    assert.equal(resolvedPort > occupiedPort, true);
  } finally {
    await new Promise((resolve) => occupiedServer.close(resolve));
  }
});
