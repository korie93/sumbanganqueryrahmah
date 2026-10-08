import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import { createClient } from "redis";

test("CI requires isolated live Redis idle session-revocation recovery and ACL verification", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const job = workflow.split("  build-and-test:")[1]?.split("  coverage-gate:")[0] || "";
  assert.match(job, /services:\s+redis:\s+image: redis:7-alpine/);
  assert.match(job, /127\.0\.0\.1:6379:6379/);
  const step = job.split("- name: Verify live Redis session revocation recovery")[1]?.split("- name:")[0] || "";
  assert.match(step, /timeout-minutes: 2/);
  assert.match(step, /SQR_SESSION_REVOCATION_TEST_REDIS_URL: redis:\/\/127\.0\.0\.1:6379\/0/);
  assert.match(step, /SQR_SESSION_REVOCATION_TEST_REDIS_REQUIRED: "1"/);
  assert.match(step, /run: node --import tsx --test server\/auth\/tests\/redis-session-revocation-live\.integration\.test\.ts/);
  assert.doesNotMatch(step, /continue-on-error|if:/);

  const source = readFileSync("server/auth/tests/redis-session-revocation-live.integration.test.ts", "utf8");
  assert.match(source, /skip: !redisUrl && !required/);
  assert.match(source, /assert\.ok\(redisUrl,/);
  assert.match(source, /delete process\.env\.SQR_SESSION_REVOCATION_TEST_REDIS_URL/);
  assert.match(source, /knownKeys\.size <= 100/);
  assert.match(source, /control\.clientKill\(\{ filter: "ID", id: clientId \}\)/);
  assert.match(source, /control\.aclSetUser\(username, \["-get"\]\)/);
  assert.match(source, /control\.aclSetUser\(username, \["\+get"\]\)/);
  assert.match(source, /control\.aclDelUser\(username\)/);
  assert.match(source, /idle session readiness recovery/);
  assert.match(source, /idle recovery after restoring GET/);
  assert.doesNotMatch(source, /\.flushAll\(|\.flushDb\(|\.scan\(|\.shutdown\(|process\.env\.REDIS_URL|dotenv/);
});

test("live Redis fixture checks a nullable ACL identity through the untransformed command", () => {
  const source = readFileSync("server/auth/tests/redis-session-revocation-live.integration.test.ts", "utf8");
  assert.match(source, /assert\.equal\(await within\(control\.sendCommand\(\["ACL", "GETUSER", username\]\), "check fixture ACL identity"\), null\)/);
  assert.doesNotMatch(source, /\.aclGetUser\(/);
  assert.ok(source.indexOf('"check fixture ACL identity"') < source.indexOf("userCreated = true"),
    "An existing ACL identity must be rejected before creation or cleanup takes ownership.");
});

test("installed Redis raw ACL command preserves null, existing identities and errors over RESP2", { timeout: 5_000 }, async (t) => {
  // A loopback protocol fixture tests the installed client's real reply decoder.
  // It is not a Redis substitute for the required live ACL/reconnect CI test.
  const username = "sqr-acl-protocol-test";
  const command = ["ACL", "GETUSER", username];
  const expectedWire = `*3\r\n${command.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
  const replies = ["$-1\r\n", "*2\r\n$5\r\nflags\r\n*0\r\n", "-NOPERM ACL access denied\r\n"];
  const received = [];
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    let pending = "";
    socket.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      if (pending.length < expectedWire.length) return;
      received.push(pending);
      if (pending !== expectedWire || received.length > replies.length) {
        socket.destroy();
        return;
      }
      pending = "";
      socket.write(replies[received.length - 1]);
    });
  });
  let client;
  t.after(async () => {
    if (client?.isOpen) client.destroy();
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  client = createClient({
    socket: { host: "127.0.0.1", port: address.port, reconnectStrategy: false, connectTimeout: 1_000 },
    // Omit RESP to use the client's default RESP2 without an explicit HELLO.
    disableClientInfo: true, maintNotifications: "disabled", disableOfflineQueue: true,
  });
  client.on("error", () => undefined);
  await client.connect();
  assert.equal(await client.sendCommand(command), null);
  assert.deepEqual(await client.sendCommand(command), ["flags", []]);
  await assert.rejects(client.sendCommand(command), /NOPERM/);
  assert.deepEqual(received, Array(3).fill(expectedWire));
});
