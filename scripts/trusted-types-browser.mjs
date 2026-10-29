import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

// Actual application modules, synthetic markup and an ephemeral loopback server.
// No application backend, dotenv, database, credentials or external traffic.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = path.join(rootDir, "artifacts", "trusted-types-browser");
const report = {
  status: "running",
  scope: "Actual sanitizer outputs, native Trusted Types sinks and per-call configuration isolation; not report-popup rendering.",
  cases: [],
  failure: null,
};
const allowedPolicies = ["default", "sqr-ui", "dompurify"];
const reportStyleHash = "'sha256-qf+F/uYe2V4uHjsMvEpXNI3wjz62t5ULXvH9A23mYIk='";
const browserEntry = `
  import DOMPurify from 'dompurify';
  import { sanitizeTrustedHtml, toTrustedHTML } from './client/src/lib/trusted-types';
  import { initializeTrustedTypesRuntime, initializeTrustedTypesRuntimeForGlobal } from './client/src/lib/trusted-types-runtime';
  import { sanitizeAIMessageContentForDisplay } from './client/src/components/ai-message-sanitizer';
  import { sanitizeCollectionMonthlyComparisonReportHtml } from './client/src/pages/collection-summary/collection-monthly-report-window';
  import { SQR_ALLOWED_TRUSTED_TYPES_POLICY_NAMES } from './shared/trusted-types';
  window.__sqrSanitizerProbe = {
    DOMPurify, sanitizeTrustedHtml, toTrustedHTML, initializeTrustedTypesRuntime, initializeTrustedTypesRuntimeForGlobal,
    sanitizeAIMessageContentForDisplay, sanitizeCollectionMonthlyComparisonReportHtml,
    allowedPolicies: SQR_ALLOWED_TRUSTED_TYPES_POLICY_NAMES,
  };
`;
let browser;
let server;
let origin;

async function withinCaseDeadline(page, run) {
  let timer;
  try {
    return await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          void page.close().catch(() => undefined);
          reject(new Error("Trusted Types browser case exceeded 20 seconds."));
        }, 20_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runCase({ strict, firstConsumer, initializeBefore, scenario = "matrix" }) {
  const label = scenario === "matrix"
    ? `${strict ? "strict" : "normal"}/${firstConsumer}-first/runtime-${initializeBefore ? "before" : "after"}`
    : `strict/${scenario}`;
  const entry = { label, status: "running" };
  report.cases.push(entry);
  const context = await browser.newContext({ serviceWorkers: "block" });
  const errors = [];
  const unexpectedRequests = [];
  try {
    await context.route("**/*", route => {
      const request = route.request();
      if (new URL(request.url()).origin !== origin || !["GET", "HEAD"].includes(request.method())) {
        unexpectedRequests.push("Unexpected off-origin or mutation request.");
        return route.abort();
      }
      return route.continue();
    });
    await context.routeWebSocket("**/*", socket => {
      unexpectedRequests.push("Unexpected WebSocket.");
      socket.close();
    });
    await context.addInitScript(() => {
      const policyCounts = Object.create(null);
      const violations = [];
      const factory = globalThis.trustedTypes;
      const nativeCreatePolicy = factory?.createPolicy;
      globalThis.__sqrTrustedTypesDiagnostics = { policyCounts, violations };
      if (factory && typeof nativeCreatePolicy === "function") {
        Object.defineProperty(factory, "createPolicy", {
          configurable: true,
          value(name, options) {
            policyCounts[name] = (policyCounts[name] || 0) + 1;
            return Reflect.apply(nativeCreatePolicy, factory, [name, options]);
          },
        });
      }
      document.addEventListener("securitypolicyviolation", event => {
        violations.push({ directive: event.effectiveDirective, disposition: event.disposition });
      });
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(15_000);
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
    });
    await withinCaseDeadline(page, async () => {
      await page.goto(`${origin}/?strict=${strict ? "1" : "0"}`);
      assert.equal(new URL(page.url()).origin, origin);
      const result = await page.evaluate(async ({ strict, firstConsumer, initializeBefore, scenario }) => {
        const probe = window.__sqrSanitizerProbe;
        const diagnostics = window.__sqrTrustedTypesDiagnostics;
        const factory = window.trustedTypes;
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        check(probe.DOMPurify.isSupported === true, "Exercise actual DOMPurify, not a non-DOM fallback.");
        check(!strict || typeof factory?.isHTML === "function", "Strict Trusted Types requires the native browser API; do not silently skip it.");
        const safeHtml = "<b>Safe trusted text</b>";
        const dirtyHtml = `${safeHtml}<script>window.__sqrUnexpectedExecution=true</script><img src="javascript:alert(1)" onerror="window.__sqrUnexpectedExecution=true"><iframe src="https://invalid.example/fixture"></iframe>`;
        const unsafe = /<script|<iframe|\son[a-z]+\s*=|javascript:/i;
        const reportHtml = '<!doctype html><html lang="ms"><head><title>Report</title><style>td{color:black}</style></head><body><main><table><tbody><tr><td>RM 125.00</td></tr></tbody></table><svg viewBox="0 0 100 40" role="img" aria-label="Monthly chart"><rect width="20" height="30" fill="blue" onclick="window.__sqrUnexpectedExecution=true"/><text x="2" y="15">Oct</text></svg><button type="button" onclick="window.__sqrUnexpectedExecution=true">Print</button></main><script>window.__sqrUnexpectedExecution=true</script></body></html>';
        const verifyTrusted = () => {
          const sanitized = probe.sanitizeTrustedHtml(dirtyHtml);
          check(typeof sanitized === "string" && sanitized.includes(safeHtml), "Trusted sanitizer must preserve safe formatting.");
          check(!unsafe.test(sanitized), "Trusted sanitizer must remove unsafe markup.");
        };
        const verifyMonthly = () => {
          const sanitized = probe.sanitizeCollectionMonthlyComparisonReportHtml(reportHtml);
          check(sanitized.includes("<title>Report</title>"), "Monthly report title must survive configuration changes.");
          check(sanitized.includes("<td>RM 125.00</td>"), "Monthly report table must survive configuration changes.");
          check(sanitized.includes("<style>td{color:black}</style>"), "Monthly report style must survive configuration changes.");
          check(/<svg[^>]*viewBox="0 0 100 40"/.test(sanitized), "Monthly report SVG must survive configuration changes.");
          check(/<rect[^>]*width="20"/.test(sanitized) && sanitized.includes(">Oct</text>"), "Monthly report chart details must survive.");
          check(sanitized.includes('<button type="button">Print</button>'), "Monthly report print action stays non-executable markup.");
          check(!unsafe.test(sanitized), "Monthly report must remove unsafe markup.");
        };
        const verifyAi = () => {
          check(probe.sanitizeAIMessageContentForDisplay('<p>Hello <strong>team</strong></p><script>window.__sqrUnexpectedExecution=true</script>') === "Hello team", "AI sanitizer remains plain text.");
        };
        if (scenario === "explicit-sink-before-default") {
          check(!diagnostics.policyCounts.default, "Fresh explicit-sink case must start without a default policy.");
          const trustedHtml = probe.toTrustedHTML(dirtyHtml);
          check(factory.isHTML(trustedHtml), "Explicit sink without a default policy must receive native TrustedHTML.");
          const node = document.createElement("div");
          node.innerHTML = trustedHtml;
          check(node.innerHTML.includes(safeHtml) && !unsafe.test(node.innerHTML), "Explicit sink must preserve safe HTML before default initialization.");
          check(!diagnostics.policyCounts.default, "Explicit toTrustedHTML must not rely on creating a default policy.");
        }
        if (initializeBefore) probe.initializeTrustedTypesRuntime();
        if (firstConsumer === "trusted") verifyTrusted(); else verifyMonthly();
        if (!initializeBefore) probe.initializeTrustedTypesRuntime();
        const initialDefaultPolicy = probe.initializeTrustedTypesRuntime();
        check(probe.initializeTrustedTypesRuntime() === initialDefaultPolicy, "Default runtime policy must be reused.");
        for (let iteration = 0; iteration < 3; iteration += 1) {
          const consumers = firstConsumer === "trusted" ? [verifyTrusted, verifyAi, verifyMonthly] : [verifyMonthly, verifyAi, verifyTrusted];
          consumers.forEach(verify => verify());
          const trustedHtml = probe.toTrustedHTML(dirtyHtml);
          check(!factory || factory.isHTML(trustedHtml), "The application policy must return native TrustedHTML.");
          const typedSink = document.createElement("div");
          typedSink.innerHTML = trustedHtml;
          check(typedSink.innerHTML.includes(safeHtml) && !unsafe.test(typedSink.innerHTML), "Native TrustedHTML sink retains only safe HTML.");
          if (factory) {
            const defaultSink = document.createElement("div");
            // Only enforcing CSP routes raw strings through the default policy.
            // Without enforcement, exercise its native result explicitly.
            defaultSink.innerHTML = strict ? dirtyHtml : initialDefaultPolicy.createHTML(dirtyHtml);
            check(defaultSink.innerHTML.includes(safeHtml) && !unsafe.test(defaultSink.innerHTML), "Default/raw innerHTML sink is sanitized.");
          }
          verifyAi();
          verifyMonthly();
          verifyTrusted();
        }
        if (scenario === "same-origin-iframe") {
          const iframe = document.createElement("iframe");
          iframe.title = "Isolated Trusted Types target";
          iframe.src = "/frame?strict=1";
          const loaded = new Promise(resolve => iframe.addEventListener("load", resolve, { once: true }));
          document.body.append(iframe);
          await loaded;
          const target = iframe.contentWindow;
          check(target && target.location.origin === location.origin, "Iframe target must remain same origin.");
          check(typeof target.trustedTypes?.isHTML === "function", "Iframe must expose native Trusted Types under inherited strict CSP.");
          const iframeViolations = [];
          target.document.addEventListener("securitypolicyviolation", event => {
            iframeViolations.push({ directive: event.effectiveDirective, disposition: event.disposition });
          });
          window.__sqrIframeDiagnostics = { violations: iframeViolations };
          const policy = probe.initializeTrustedTypesRuntimeForGlobal(target);
          check(policy && probe.initializeTrustedTypesRuntimeForGlobal(target) === policy, "Iframe default policy must be installed once and reused.");
          check(target.trustedTypes.isHTML(policy.createHTML(dirtyHtml)), "Iframe policy must return native TrustedHTML in its target realm.");
          const node = target.document.createElement("div");
          node.innerHTML = dirtyHtml;
          target.document.body.append(node);
          check(node.innerHTML.includes(safeHtml) && !unsafe.test(node.innerHTML), "Iframe raw sink must preserve safe HTML and remove unsafe markup.");
          check(target.__sqrUnexpectedExecution !== true, "Unsafe iframe markup must not execute.");
          verifyTrusted();
          verifyMonthly();
          verifyAi();
        }
        check(window.__sqrUnexpectedExecution !== true, "Synthetic unsafe markup must never execute.");
        return {
          version: probe.DOMPurify.version,
          nativeTrustedTypes: Boolean(factory),
          policyCounts: { ...diagnostics.policyCounts },
          allowedPolicies: probe.allowedPolicies,
        };
      }, { strict, firstConsumer, initializeBefore, scenario });
      // Allow asynchronous CSP reports to be delivered before checking them.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const violations = await page.evaluate(() => [
        ...window.__sqrTrustedTypesDiagnostics.violations,
        ...(window.__sqrIframeDiagnostics?.violations ?? []),
      ]);
      Object.assign(entry, { version: result.version, nativeTrustedTypes: result.nativeTrustedTypes, policyCounts: result.policyCounts, violations });
      assert.deepEqual(result.allowedPolicies, allowedPolicies, "Probe CSP must match the application's policy allowlist.");
      if (result.nativeTrustedTypes) {
        assert.deepEqual(result.policyCounts, { dompurify: 1, default: 1, "sqr-ui": 1 }, "All consumers must share one real DOMPurify policy without duplicate attempts.");
      }
      assert.deepEqual(errors, [], "Browser must not report sanitizer errors or warnings.");
      assert.deepEqual(violations, [], "Existing strict CSP must remain violation-free.");
      assert.deepEqual(unexpectedRequests, [], "Only read-only loopback requests are permitted.");
      Object.assign(entry, { status: "passed", version: result.version, nativeTrustedTypes: result.nativeTrustedTypes, policyCounts: result.policyCounts });
    });
    console.log(`PASS [trusted-types-browser] ${label}`);
  } catch (error) {
    Object.assign(entry, { status: "failed", error: error instanceof Error ? error.message : String(error), browserErrors: errors });
    throw error;
  } finally {
    await context.close();
  }
}

try {
  await mkdir(artifactsDir, { recursive: true });
  const bundle = await build({
    stdin: { contents: browserEntry, resolveDir: rootDir, loader: "ts" },
    bundle: true, platform: "browser", format: "iife", write: false,
  });
  server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (!["GET", "HEAD"].includes(request.method)) return void response.writeHead(405).end();
    response.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/probe.js") return void response.writeHead(200, { "Content-Type": "application/javascript" }).end(bundle.outputFiles[0].text);
    if (url.pathname === "/favicon.ico") return void response.writeHead(204).end();
    if (url.pathname !== "/" && url.pathname !== "/frame") return void response.writeHead(404).end();
    const strict = url.searchParams.get("strict") === "1";
    response.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self'; style-src 'self' ${reportStyleHash}; object-src 'none'; base-uri 'none'${strict ? `; trusted-types ${allowedPolicies.join(" ")}; require-trusted-types-for 'script'` : ""}`);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><html lang="en"><head><title>SQR sanitizer browser regression</title></head><body>${url.pathname === "/" ? '<script src="/probe.js"></script>' : ""}</body></html>`);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(resolvePlaywrightLaunchOptions());
  report.browserVersion = browser.version();
  console.log(`[trusted-types-browser] Chromium ${report.browserVersion}`);
  for (const strict of [false, true]) {
    for (const firstConsumer of ["trusted", "monthly"]) {
      for (const initializeBefore of [true, false]) await runCase({ strict, firstConsumer, initializeBefore });
    }
  }
  await runCase({ strict: true, firstConsumer: "trusted", initializeBefore: false, scenario: "explicit-sink-before-default" });
  await runCase({ strict: true, firstConsumer: "trusted", initializeBefore: true, scenario: "same-origin-iframe" });
  report.status = "passed";
  console.log(`Trusted Types browser regression passed ${report.cases.length}/${report.cases.length}; report: artifacts/trusted-types-browser/report.json`);
} catch (error) {
  report.status = "failed";
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(`Trusted Types browser regression failed: ${report.failure}`);
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(path.join(artifactsDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
}
