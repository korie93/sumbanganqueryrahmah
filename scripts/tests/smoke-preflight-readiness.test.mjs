import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import path from "node:path";
import test from "node:test";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function runSmokePreflight(env) {
  const scriptPath = path.resolve("scripts/smoke-preflight.mjs");
  const child = spawn(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const [exitCode, signal] = await once(child, "exit");
  return { exitCode, signal, stderr, stdout };
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "connection": "close",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

test("smoke preflight waits for transient degraded readiness to recover", async () => {
  let readyAttempts = 0;
  const server = http.createServer((request, response) => {
    if (request.url === "/api/health/live") {
      writeJson(response, 200, { status: "ok", ready: true });
      return;
    }
    if (request.url === "/api/health/ready") {
      readyAttempts += 1;
      if (readyAttempts < 3) {
        writeJson(response, 503, { status: "degraded", ready: false });
        return;
      }
      writeJson(response, 200, { status: "ok", ready: true });
      return;
    }
    if (request.url === "/") {
      response.writeHead(200, {
        "connection": "close",
        "content-type": "text/html; charset=utf-8",
      });
      response.end("<!doctype html><title>SQR</title>");
      return;
    }
    if (request.url === "/api/me") {
      writeJson(response, 401, { message: "Token required" });
      return;
    }
    writeJson(response, 404, { message: "Not found" });
  });

  await listen(server);
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await runSmokePreflight({
      SMOKE_BASE_URL: `http://127.0.0.1:${address.port}`,
      SMOKE_PREFLIGHT_READY_RETRY_MS: "5",
      SMOKE_PREFLIGHT_READY_TIMEOUT_MS: "1000",
      SMOKE_TEST_PASSWORD: "",
      SMOKE_TEST_USERNAME: "",
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.equal(readyAttempts, 3);
    assert.match(result.stderr, /readiness returned 503; retrying/);
  } finally {
    await close(server);
  }
});
