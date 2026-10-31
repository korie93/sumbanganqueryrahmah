import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { expect, test, type BrowserContext } from "@playwright/test";

test.describe.configure({ retries: 0 });
const strictPolicy = "default-src 'self'; script-src 'self'; require-trusted-types-for 'script'; style-src-elem 'self'; style-src-attr 'none'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

// A real loopback server preserves the browser's native preload cache. Playwright
// request interception disables that cache and cannot prove one wire transfer.
async function startupServer(baseURL: string | undefined) {
  expect(baseURL).toBeTruthy();
  const upstream = new URL(baseURL!);
  expect(upstream.protocol).toBe("http:");
  expect(upstream.hostname).toBe("127.0.0.1");
  expect(upstream.port).not.toBe("");
  const requests: string[] = [], unexpected: string[] = [], failures: string[] = [];
  const pending = new Set<Promise<void>>();
  const completedAssets = new Set<string>();
  let releaseScripts!: () => void, transferred = 0;
  const scriptGate = new Promise<void>(resolve => { releaseScripts = resolve; });
  const json = (response: ServerResponse, value: unknown, status = 200) => {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(value));
  };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requests.length >= 256) throw new Error("Synthetic startup request limit exceeded");
    requests.push(`${request.method} ${url.pathname}`);
    if (request.method === "GET" && url.pathname === "/api/health/connectivity") {
      response.writeHead(204, { "X-SQR-Connectivity": "ok", "Cache-Control": "no-store" }); response.end(); return;
    }
    if (request.method === "GET" && url.pathname === "/api/health") return json(response, { status: "ok", ready: true });
    if (request.method === "GET" && url.pathname === "/api/maintenance-status") return json(response, { maintenance: false });
    if (request.method === "GET" && url.pathname === "/api/me") return json(response, { ok: false }, 401);
    if (request.method === "POST" && url.pathname === "/api/telemetry/web-vitals") {
      request.resume(); return json(response, { ok: true });
    }
    const staticPath = url.pathname === "/" || /^\/boot-shell\.(?:js|css)$/.test(url.pathname)
      || /^\/assets\/[A-Za-z0-9_-]+\.(?:js|css|png|webp|svg|woff2?)$/.test(url.pathname)
      || /^\/landing-next\/[A-Za-z0-9_-]+\.svg$/.test(url.pathname)
      || /^\/brand\/[A-Za-z0-9_-]+\.(?:svg|png|ico)$/.test(url.pathname)
      || ["/site.webmanifest", "/favicon.ico"].includes(url.pathname);
    if (!staticPath || !["GET", "HEAD"].includes(request.method ?? "")) {
      unexpected.push(`${request.method} ${url.pathname}`); return json(response, { ok: false }, 403);
    }
    // Hold only the app entry. Holding every module would consume the HTTP/1
    // connection pool and prevent the very preloads this scenario observes.
    if (/^\/assets\/index-[A-Za-z0-9_-]+\.js$/.test(url.pathname)) await scriptGate;
    const original = await fetch(new URL(url.pathname + url.search, upstream.origin), {
      method: request.method ?? "GET", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (!original.ok) throw new Error(`Unexpected static response ${original.status} ${url.pathname}`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (original.body) {
      const reader = original.body.getReader();
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength; transferred += next.value.byteLength;
          if (size > 8 * 1024 * 1024 || transferred > 32 * 1024 * 1024) {
            await reader.cancel(); throw new Error("Synthetic startup response limit exceeded");
          }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
    }
    const body = Buffer.concat(chunks);
    const headers: Record<string, string | number> = {
      "Content-Type": original.headers.get("content-type") ?? "application/octet-stream",
      "Content-Length": body.length, "Content-Security-Policy": strictPolicy,
      "X-Content-Type-Options": "nosniff",
    };
    if (url.pathname.endsWith(".svg")) {
      // Match Express static's normal revalidation policy. This only changes the
      // synthetic test server; no production caching policy is modified.
      headers["Cache-Control"] = "public, max-age=0";
      headers.ETag = `"${createHash("sha256").update(body).digest("hex")}"`;
    } else if (/^\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/i.test(url.pathname)) {
      // Match isImmutableFrontendAsset in Express static even when the upstream
      // fixture defaults to no-store, so preload reuse remains a native test.
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    } else headers["Cache-Control"] = original.headers.get("cache-control") ?? "no-store";
    if (request.method === "GET" && /^\/assets\/[A-Za-z0-9_-]+\.(?:js|css)$/.test(url.pathname)) {
      response.once("finish", () => { completedAssets.add(url.pathname); });
    }
    response.writeHead(original.status, headers); response.end(body);
  };
  const server = createServer((request, response) => {
    const operation = handle(request, response).catch(error => {
      failures.push(error instanceof Error ? error.message : "Synthetic startup server error");
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }).finally(() => { pending.delete(operation); });
    pending.add(operation);
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected isolated TCP address");
  return {
    origin: `http://127.0.0.1:${address.port}`, requests, unexpected, failures, completedAssets, releaseScripts,
    async close() {
      releaseScripts();
      while (pending.size) await Promise.all(pending);
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    },
  };
}

for (const reducedMotion of [false, true]) {
  test(`Landing startup discovers route assets and transfers one radar before app execution (${reducedMotion ? "reduced motion" : "full motion"})`, async ({ browser, baseURL }) => {
    const fixture = await startupServer(baseURL);
    let context: BrowserContext | undefined;
    const expectedRadar = `/landing-next/radar-${reducedMotion ? "static" : "animated"}.svg`;
    const radarTransfers = () => fixture.requests.filter(request => /^GET \/landing-next\/radar-/.test(request));
    try {
      context = await browser.newContext({ baseURL: fixture.origin, viewport: { width: 390, height: 844 },
        colorScheme: "light", reducedMotion: reducedMotion ? "reduce" : "no-preference", serviceWorkers: "block" });
      const page = await context.newPage(), errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto("/", { waitUntil: "commit" });
      await expect.poll(() => page.locator('meta[name="sqr-landing-style"]').count()).toBeGreaterThan(0);
      const hints = await page.locator('meta[name="sqr-landing-script"], meta[name="sqr-landing-style"]')
        .evaluateAll(elements => elements.map(element => element.getAttribute("content") ?? ""));
      for (const asset of hints) {
        expect(asset).toMatch(/^\/assets\/[A-Za-z0-9_-]+\.(?:js|css)$/);
        await expect.poll(() => fixture.requests).toContain(`GET ${asset}`);
        await expect.poll(() => fixture.completedAssets.has(asset), `${asset} completes before app execution`).toBe(true);
      }
      await expect.poll(radarTransfers).toEqual([`GET ${expectedRadar}`]);
      const preload = page.locator(`link[rel="preload"][as="image"][href="${expectedRadar}"]`);
      await expect(preload).toHaveAttribute("media", `(prefers-reduced-motion: ${reducedMotion ? "reduce" : "no-preference"})`);
      await expect(preload).toHaveAttribute("fetchpriority", "high");
      await expect(preload).not.toHaveAttribute("crossorigin");
      await expect(page.locator(".sqr-landing-next")).toHaveCount(0);
      const initialStyles = await page.locator('link[rel="stylesheet"][href]')
        .evaluateAll(elements => elements.map(element => new URL((element as HTMLLinkElement).href).pathname)
          .filter(path => /^\/assets\/[A-Za-z0-9_-]+\.css$/.test(path)));
      for (const asset of initialStyles) {
        await expect.poll(() => fixture.completedAssets.has(asset), `${asset} is ready before releasing the entry`).toBe(true);
      }
      const beforeApp = new Set(fixture.completedAssets);
      fixture.releaseScripts();
      await expect(page.locator(".sqr-landing-next h1")).toHaveText("Search.Analyse.Monitor.");
      // Read the styles actually applied by the mounted page, independently of
      // advertised hints. Missing transitive CSS must not arrive after startup.
      const appliedStyles = await page.locator('link[rel="stylesheet"][href]')
        .evaluateAll(elements => elements.map(element => new URL((element as HTMLLinkElement).href).pathname)
          .filter(path => /^\/assets\/[A-Za-z0-9_-]+\.css$/.test(path)));
      expect(appliedStyles.length).toBeGreaterThan(0);
      for (const asset of new Set(appliedStyles)) {
        expect(beforeApp.has(asset), `${asset} is ready before app execution`).toBe(true);
        expect(fixture.requests.filter(request => request === `GET ${asset}`), `${asset} reuses one native preload transfer`)
          .toEqual([`GET ${asset}`]);
      }
      const radar = page.locator(".radar-artwork");
      await expect(radar).toHaveAttribute("src", expectedRadar);
      await expect(radar).toHaveAttribute("fetchpriority", "high");
      await expect.poll(() => radar.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      expect(fixture.requests.filter(request => /^GET \/assets\/(?:ui|public-auth-runtime)-[A-Za-z0-9_-]+\.(?:js|css)$/.test(request)),
        "Shared landing icons must not fetch the auth presentation or UI graph").toEqual([]);
      expect(radarTransfers()).toEqual([`GET ${expectedRadar}`]);
      const entries = await page.evaluate(() => performance.getEntriesByType("resource")
        .filter(entry => /^\/landing-next\/radar-/.test(new URL(entry.name).pathname)).map(entry => new URL(entry.name).pathname));
      expect(entries).toEqual([expectedRadar]);
      expect(fixture.unexpected).toEqual([]); expect(fixture.failures).toEqual([]); expect(errors).toEqual([]);
    } finally {
      fixture.releaseScripts();
      try { await context?.close(); }
      finally { await fixture.close(); }
    }
  });
}
