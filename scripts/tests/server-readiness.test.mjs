import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  formatServerStartupExitMessage,
  waitForServer,
} from "../lib/server-readiness.mjs";

class FakeProcess extends EventEmitter {
  exitCode = null;
  signalCode = null;
}

test("waitForServer resolves when server returns a usable HTTP status", async () => {
  await waitForServer("http://127.0.0.1:5000", {
    fetchImpl: async () => ({ status: 302 }),
    pollIntervalMs: 0,
    sleepImpl: async () => {},
    timeoutMs: 100,
  });
});

test("waitForServer fails fast when the server process exits early", async () => {
  const serverProcess = new FakeProcess();

  await assert.rejects(
    waitForServer("http://127.0.0.1:5000", {
      fetchImpl: async () => {
        throw new Error("not ready");
      },
      logPath: "artifacts/release-readiness-local/server.log",
      pollIntervalMs: 0,
      serverProcess,
      sleepImpl: async () => {
        serverProcess.emit("exit", 1, null);
      },
      timeoutMs: 100,
    }),
    /Server process exited with exit code 1 before http:\/\/127\.0\.0\.1:5000 became ready.*server\.log/,
  );
});

test("formatServerStartupExitMessage includes signals and log hints", () => {
  assert.equal(
    formatServerStartupExitMessage({
      logPath: "server.log",
      signal: "SIGTERM",
      url: "http://127.0.0.1:5000",
    }),
    "Server process exited with signal SIGTERM before http://127.0.0.1:5000 became ready. See server log: server.log",
  );
});
