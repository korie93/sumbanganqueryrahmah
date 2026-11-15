import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("all locked HTTP instrumentation copies contain the incoming query redaction patch", () => {
  const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const semver = require("semver");
  const copies = Object.entries(lock.packages).filter(([name]) => name.endsWith("node_modules/@opentelemetry/instrumentation-http"));
  assert.ok(copies.length > 0);
  for (const [, entry] of copies) {
    assert.equal(semver.satisfies(entry.version, ">=0.204.0 <0.222.0"), false);
    assert.ok(semver.gte(entry.version, "0.222.0"));
    assert.equal(entry.version, manifest.overrides["@opentelemetry/instrumentation-http"]);
  }
  assert.equal(require("@opentelemetry/instrumentation-http/package.json").version,
    lock.packages["node_modules/@opentelemetry/instrumentation-http"].version);
});

test("HTTP server spans redact signed URL credentials without changing the request", { timeout: 10_000 }, async (t) => {
  const previous = process.env.OTEL_SEMCONV_STABILITY_OPT_IN;
  process.env.OTEL_SEMCONV_STABILITY_OPT_IN = "http";
  const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");
  const { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor, AlwaysOnSampler } =
    require("@opentelemetry/sdk-trace-base");
  const { SpanKind } = require("@opentelemetry/api");
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const instrumentation = new HttpInstrumentation();
  instrumentation.setTracerProvider(provider);
  // Load HTTP only after installing the real instrumentation hook.
  const http = require("node:http");
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.end("synthetic-ok");
  });
  const agent = new http.Agent({ keepAlive: false, proxyEnv: {} });
  t.after(async () => {
    instrumentation.disable();
    agent.destroy();
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await provider.shutdown();
    if (previous === undefined) delete process.env.OTEL_SEMCONV_STABILITY_OPT_IN;
    else process.env.OTEL_SEMCONV_STABILITY_OPT_IN = previous;
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const path = "/synthetic?sig=synthetic-azure-secret&X-Amz-Signature=synthetic-aws-secret&batch=P10";
  await new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port: server.address().port, path, agent }, (response) => {
      response.on("error", reject);
      response.resume();
      response.on("end", resolve);
    });
    request.on("error", reject);
    request.setTimeout(2_000, () => request.destroy(new Error("Synthetic HTTP request timed out")));
  });
  await provider.forceFlush();
  assert.deepEqual(requests, [path], "redaction must not mutate the application's request");
  const spans = exporter.getFinishedSpans();
  const serverSpans = spans.filter((span) => span.kind === SpanKind.SERVER);
  assert.equal(serverSpans.length, 1, "a real incoming server span must be captured");
  assert.equal(serverSpans[0].attributes["http.response.status_code"], 200);
  assert.match(serverSpans[0].attributes["url.query"], /batch=P10/);
  assert.match(serverSpans[0].attributes["url.query"], /REDACTED/);
  for (const span of spans) {
    const exported = JSON.stringify({ attributes: span.attributes, events: span.events });
    assert.equal(exported.includes("synthetic-azure-secret"), false, "Azure signature must not be exported");
    assert.equal(exported.includes("synthetic-aws-secret"), false, "AWS signature must not be exported");
  }
  const fromAuto = createRequire(require.resolve("@opentelemetry/auto-instrumentations-node"));
  assert.equal(fromAuto.resolve("@opentelemetry/instrumentation-http"), require.resolve("@opentelemetry/instrumentation-http"));
});
