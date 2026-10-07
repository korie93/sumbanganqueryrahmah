import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import http from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const compression = require("compression");
const proxyAddr = require("proxy-addr");

async function withinDeadline(promise, description) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test("proxy trust rejects IPv4 addresses in broad IPv6 and short mapped prefixes", () => {
  for (const subnet of ["::/1", "::ffff:10.0.0.0/8"]) {
    const trust = proxyAddr.compile([subnet]);
    for (const remoteAddress of ["198.51.100.8", "::ffff:198.51.100.8"]) {
      assert.equal(trust(remoteAddress), false, `${subnet} must not trust ${remoteAddress}`);
      assert.equal(proxyAddr({
        connection: { remoteAddress },
        headers: { "x-forwarded-for": "203.0.113.99" },
      }, trust), remoteAddress, "an untrusted peer must not choose its reported client IP");
    }
  }
});

test("proxy trust preserves IPv4, correctly mapped IPv6, and loopback behavior", () => {
  for (const subnet of ["10.0.0.0/8", "::ffff:10.0.0.0/104"]) {
    const trust = proxyAddr.compile([subnet]);
    assert.equal(trust("10.2.3.4"), true);
    assert.equal(trust("::ffff:10.2.3.4"), true);
    assert.equal(trust("198.51.100.8"), false);
    assert.equal(proxyAddr({
      connection: { remoteAddress: "::ffff:10.2.3.4" },
      headers: { "x-forwarded-for": "203.0.113.99, 198.51.100.8" },
    }, trust), "198.51.100.8", "stop at the first untrusted hop");
  }

  const loopback = proxyAddr.compile(["loopback"]);
  for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    assert.equal(loopback(address), true);
  }
  assert.equal(loopback("198.51.100.8"), false);

  const ipv6 = proxyAddr.compile(["2001:db8::/32"]);
  assert.equal(ipv6("2001:db8::1234"), true);
  assert.equal(ipv6("2001:db9::1234"), false);
  assert.equal(ipv6("198.51.100.8"), false);
});

test("compression preserves gzip responses and releases streams after bounded disconnects", { timeout: 15_000 }, async (t) => {
  const payload = "local compression regression payload\n".repeat(128);
  const streams = [];
  const responses = [];
  const originalCreateGzip = zlib.createGzip;
  t.mock.method(zlib, "createGzip", (...args) => {
    const stream = originalCreateGzip(...args);
    streams.push({ stream, closed: once(stream, "close") });
    return stream;
  });

  const middleware = compression({ threshold: 1024, level: 6 });
  const server = http.createServer((req, res) => {
    responses.push(res);
    res.setHeader("Content-Type", "text/plain");
    middleware(req, res, () => {
      if (req.url === "/stream") {
        res.write(payload);
        res.flush();
        // Leave this finite response open so the client closes it before end().
        return;
      }
      res.end(payload);
    });
  });
  t.after(async () => {
    for (const { stream } of streams) stream.destroy();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;

  const roundTrip = await withinDeadline(new Promise((resolve, reject) => {
    const request = http.get({
      hostname: "127.0.0.1", port, path: "/complete", agent: false,
      headers: { "accept-encoding": "gzip" },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => resolve({ headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.once("error", reject);
  }), "gzip round trip");
  assert.equal(roundTrip.headers["content-encoding"], "gzip");
  assert.match(roundTrip.headers.vary, /accept-encoding/i);
  assert.equal(zlib.gunzipSync(roundTrip.body).toString("utf8"), payload);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const streamIndex = streams.length;
    const responseIndex = responses.length;
    await withinDeadline(new Promise((resolve, reject) => {
      const request = http.get({
        hostname: "127.0.0.1", port, path: "/stream", agent: false,
        headers: { "accept-encoding": "gzip" },
      }, (response) => {
        response.once("error", reject);
        response.once("data", () => {
          response.destroy();
          request.destroy();
          resolve();
        });
      });
      request.once("error", reject);
    }), "client receives streaming response");
    assert.equal(streams.length, streamIndex + 1);
    await withinDeadline(streams[streamIndex].closed, "aborted gzip stream closes");
    assert.equal(responses[responseIndex].writableEnded, false, "the response was aborted before completion");
    assert.equal(streams[streamIndex].stream.destroyed, true);
    assert.equal(streams[streamIndex].stream.closed, true);
  }
});

// Exercise real pg Client and OpenTelemetry hooks through an in-memory protocol
// adapter. No socket, database, resource detector, or remote exporter is created.
class LocalPgConnection extends EventEmitter {
  parsedStatements = {};
  queries = [];

  connect() {
    this._connecting = true;
    queueMicrotask(() => this.emit("connect"));
  }

  startup() {
    queueMicrotask(() => this.emit("readyForQuery", { status: "I" }));
  }

  query(text) {
    this.queries.push(text);
    queueMicrotask(() => {
      this.emit("rowDescription", { fields: [{ name: "value", dataTypeID: 23, format: "text" }] });
      this.emit("dataRow", { fields: ["1"] });
      this.emit("commandComplete", { text: "SELECT 1" });
      this.emit("readyForQuery", { status: "I" });
    });
  }

  end() {
    queueMicrotask(() => this.emit("end"));
  }
}

test("PostgreSQL instrumentation exports useful spans without database usernames", { timeout: 10_000 }, async (t) => {
  const { PgInstrumentation } = require("@opentelemetry/instrumentation-pg");
  const { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor, AlwaysOnSampler } =
    require("@opentelemetry/sdk-trace-base");
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const instrumentation = new PgInstrumentation();
  instrumentation.setTracerProvider(provider);
  t.after(async () => {
    instrumentation.disable();
    await provider.shutdown();
  });

  // Requiring pg after enabling instrumentation exercises its public module hook.
  const { Client } = require("pg");
  const connection = new LocalPgConnection();
  const username = "synthetic_private_database_account";
  const password = "synthetic-private-database-password";
  const client = new Client({
    connection, user: username, password, database: "regression",
    host: "database.invalid", port: 5432, ssl: false,
  });
  t.after(() => client.end());
  await withinDeadline(client.connect(), "stub PostgreSQL connection");
  const result = await withinDeadline(client.query("SELECT 1 AS value"), "stub PostgreSQL query");
  assert.deepEqual(result.rows, [{ value: 1 }]);
  assert.deepEqual(connection.queries, ["SELECT 1 AS value"]);
  await provider.forceFlush();

  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 2, "both connection and query must actually be instrumented");
  assert.ok(spans.some((span) => span.attributes["db.query.text"] === "SELECT 1 AS value"));
  for (const span of spans) {
    assert.equal(span.attributes["db.system.name"], "postgresql");
    assert.equal(span.attributes["db.namespace"], "regression");
    assert.equal(Object.hasOwn(span.attributes, "db.user"), false);
    const exportedValues = JSON.stringify({ name: span.name, attributes: span.attributes, events: span.events });
    assert.equal(exportedValues.includes(username), false);
    assert.equal(exportedValues.includes(password), false);
  }
});

test("NodeSDK flushes a synthetic span through the OTLP HTTP exporter on shutdown", { timeout: 15_000 }, async (t) => {
  // This file runs in its own node:test process. Explicit SDK configuration and
  // cleared OTEL settings keep machine-specific telemetry destinations out of
  // this test; restore settings and global providers in teardown.
  const telemetryEnvironment = Object.entries(process.env).filter(([name]) => name.startsWith("OTEL_"));
  for (const [name] of telemetryEnvironment) delete process.env[name];
  t.after(() => {
    for (const [name, value] of telemetryEnvironment) process.env[name] = value;
  });

  const { NodeSDK } = require("@opentelemetry/sdk-node");
  const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
  const { resourceFromAttributes } = require("@opentelemetry/resources");
  const { AlwaysOnSampler } = require("@opentelemetry/sdk-trace-base");
  const { context, trace, propagation, metrics } = require("@opentelemetry/api");
  const { logs } = require("@opentelemetry/api-logs");
  const captures = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    let length = 0;
    req.on("data", (chunk) => {
      length += chunk.length;
      if (length > 65_536) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      captures.push({ method: req.method, path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
  });
  // An explicit agent also avoids inheriting Node's global proxy configuration.
  const agent = new http.Agent({ keepAlive: false, proxyEnv: {} });
  let sdk;
  let shutdown;
  t.after(async () => {
    try {
      if (sdk) await withinDeadline(shutdown ??= sdk.shutdown(), "telemetry teardown");
    } finally {
      trace.disable();
      context.disable();
      propagation.disable();
      metrics.disable();
      logs.disable();
      agent.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  sdk = new NodeSDK({
    serviceName: "sqr-telemetry-regression",
    resource: resourceFromAttributes({}),
    autoDetectResources: false,
    resourceDetectors: [],
    instrumentations: [],
    metricReaders: [],
    logRecordProcessors: [],
    textMapPropagator: null,
    sampler: new AlwaysOnSampler(),
    traceExporter: new OTLPTraceExporter({
      url: `http://127.0.0.1:${server.address().port}/v1/traces`,
      headers: {},
      compression: "none",
      timeoutMillis: 2_000,
      httpAgentOptions: () => agent,
    }),
  });
  sdk.start();
  const span = trace.getTracer("dependency-regression").startSpan("synthetic-export-check");
  assert.equal(span.isRecording(), true);
  span.setAttribute("regression.synthetic", true);
  span.end();
  await withinDeadline(shutdown = sdk.shutdown(), "SDK exports pending span during shutdown");

  assert.equal(captures.length, 1);
  const [capture] = captures;
  assert.equal(capture.method, "POST");
  assert.equal(capture.path, "/v1/traces");
  assert.match(capture.headers["content-type"], /application\/json/);
  const exported = JSON.parse(capture.body.toString("utf8"));
  assert.equal(exported.resourceSpans.length, 1);
  const [resourceSpans] = exported.resourceSpans;
  assert.deepEqual(resourceSpans.resource.attributes, [{
    key: "service.name", value: { stringValue: "sqr-telemetry-regression" },
  }]);
  assert.equal(resourceSpans.scopeSpans.length, 1);
  assert.equal(resourceSpans.scopeSpans[0].scope.name, "dependency-regression");
  assert.equal(resourceSpans.scopeSpans[0].spans.length, 1);
  const [exportedSpan] = resourceSpans.scopeSpans[0].spans;
  assert.equal(exportedSpan.name, "synthetic-export-check");
  assert.equal(exportedSpan.traceId, span.spanContext().traceId);
  assert.equal(exportedSpan.spanId, span.spanContext().spanId);
  assert.deepEqual(exportedSpan.attributes, [{ key: "regression.synthetic", value: { boolValue: true } }]);
});
