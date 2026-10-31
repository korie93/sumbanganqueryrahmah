import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ serviceWorkers: "block" });
const onlinePng = "/brand/favicon-online-v2-32.png";
const onlineIco = "/brand/favicon-online-v2.ico";
const offlinePng = "data:image/png;base64," + readFileSync("client/src/assets/favicon-status/offline-32.png").toString("base64");
type ResponseMode = "ok" | "503" | "html" | "marker" | "cache" | "redirect" | "network";

async function fixture(page: Page, baseURL: string, holdInitialProbe = false) {
  expect(new URL(baseURL).hostname).toBe("127.0.0.1");
  let mode: ResponseMode = "ok";
  let probes = 0;
  let releaseInitialProbe!: () => void;
  const initialProbe = new Promise<void>(resolve => { releaseInitialProbe = resolve; });
  const unexpected: string[] = [];
  await page.addInitScript(() => {
    // Connectivity belongs to this event-controlled scenario, independent of
    // the isolated runner's native signal. Real offline routing stays enabled.
    let online = true;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
    window.addEventListener("offline", () => { online = false; });
    window.addEventListener("online", () => { online = true; });
  });
  await page.clock.install();
  // This scenario tests lifecycle ownership, not machine speed during app startup.
  // Keep a deliberately held response from reaching the real 5-second timeout on CI.
  if (holdInitialProbe) await page.clock.pauseAt(new Date(Date.now() + 1_000));
  await page.context().routeWebSocket("**/*", socket => socket.close());
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) { unexpected.push("off-origin"); return route.abort(); }
    if (url.pathname === "/api/health/connectivity") {
      probes++;
      expect(request.method()).toBe("GET");
      expect(request.headers()["cookie"]).toBeUndefined();
      expect(request.headers()["authorization"]).toBeUndefined();
      if (holdInitialProbe && probes === 1) await initialProbe;
      if (mode === "network") return route.abort("failed");
      if (mode === "redirect") return route.fulfill({ status: 302, headers: { location: "/login" } });
      if (mode === "html") return route.fulfill({ status: 200, contentType: "text/html", body: "<html>SPA fallback</html>" });
      if (mode === "503") return route.fulfill({ status: 503, body: "" });
      const headers: Record<string, string> = {};
      if (mode !== "marker") headers["X-SQR-Connectivity"] = "ok";
      if (mode !== "cache") headers["Cache-Control"] = "no-store";
      return route.fulfill({ status: 204, headers });
    }
    if (url.pathname === "/api/health") return route.fulfill({ json: { status: "ok", ready: true } });
    if (url.pathname === "/api/maintenance-status") return route.fulfill({ json: { maintenance: false } });
    if (url.pathname === "/api/me") return route.fulfill({ status: 401, json: { ok: false } });
    if (url.pathname.startsWith("/api/telemetry/")) return route.fulfill({ json: { ok: true } });
    if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) {
      unexpected.push(`${request.method()} ${url.pathname}`); return route.abort();
    }
    if (request.resourceType() === "document") {
      return route.fetch().then(response => route.fulfill({ response, headers: {
        ...response.headers(),
        // Match the existing application's relevant CSP directives, including
        // permission for a bundled PNG while external scripts remain restricted.
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self'; style-src-attr 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      } }));
    }
    return route.continue();
  });
  await page.goto("/login");
  await expect(page.getByTestId("input-username")).toBeVisible();
  if (!holdInitialProbe) await expect(page.locator('link[rel="icon"]')).toHaveAttribute("data-sqr-connectivity", "online");
  return { mode: (next: ResponseMode) => { mode = next; }, probes: () => probes, unexpected, releaseInitialProbe };
}
async function checkLinks(page: Page, state: "online" | "offline") {
  const icon = page.locator('link[rel="icon"]'), shortcut = page.locator('link[rel="shortcut icon"]');
  await expect(icon).toHaveCount(1);
  await expect(shortcut).toHaveCount(1);
  await expect(icon).toHaveAttribute("data-sqr-connectivity", state);
  await expect(shortcut).toHaveAttribute("data-sqr-connectivity", state);
  await expect(icon).toHaveAttribute("href", state === "offline" ? offlinePng : onlinePng);
  await expect(shortcut).toHaveAttribute("href", state === "offline" ? offlinePng : onlineIco);
  await expect(icon).toHaveAttribute("type", "image/png");
  await expect(icon).toHaveAttribute("sizes", "32x32");
  await expect(shortcut).toHaveAttribute("type", state === "offline" ? "image/png" : "image/x-icon");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/brand/apple-touch-icon-180x180.png");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");
}
async function confirmFailure(page: Page, probes: () => number) {
  const before = probes();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(probes).toBe(before + 1);
  await checkLinks(page, "online");
  await page.clock.fastForward(2_100);
  await expect.poll(probes).toBe(before + 2);
  await checkLinks(page, "offline");
}

test("favicon status keeps one slow startup probe through pageshow without canceled requests", async ({ page, baseURL }) => {
  const failedProbes: string[] = [];
  page.on("requestfailed", request => {
    if (new URL(request.url()).pathname === "/api/health/connectivity") {
      failedProbes.push(request.failure()?.errorText ?? "unknown failure");
    }
  });
  const f = await fixture(page, baseURL!, true);
  try {
    // goto waited for load/pageshow while the initial fetch deliberately remains pending.
    expect(f.probes()).toBe(1);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("pageshow"));
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(f.probes()).toBe(1);
    expect(failedProbes).toEqual([]);
  } finally {
    f.releaseInitialProbe();
  }
  await checkLinks(page, "online");
  const before = f.probes();
  await page.clock.fastForward(20_100);
  await expect.poll(f.probes).toBe(before + 1);
  await checkLinks(page, "online");
  expect(failedProbes).toEqual([]);
  expect(f.unexpected).toEqual([]);
});

test("favicon status handles backend failures, false positives and repeated recovery without duplicate links", async ({ page, baseURL }) => {
  const f = await fixture(page, baseURL!);
  for (const mode of ["503", "html", "marker", "cache", "redirect", "network"] as const) {
    f.mode(mode);
    await confirmFailure(page, f.probes);
    f.mode("ok");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await checkLinks(page, "online");
  }
  const before = f.probes();
  await page.clock.fastForward(20_100);
  await expect.poll(f.probes).toBe(before + 1);
  expect(f.unexpected).toEqual([]);
});

test("favicon status grey PNG works offline under application CSP and survives SPA navigation", async ({ page, baseURL }) => {
  const cspErrors: string[] = [];
  page.on("console", message => {
    if (message.type() === "error" && /content security policy|violates.*directive/i.test(message.text())) cspErrors.push(message.text());
  });
  const f = await fixture(page, baseURL!);
  await page.getByRole("button", { name: "Laman utama", exact: true }).click();
  const brand = page.getByRole("banner").getByRole("link", { name: "SQR", exact: true });
  await expect(brand).toBeVisible();
  const login = page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Log in", exact: true });
  await expect(login).toHaveAttribute("href", "/login");
  await login.click();
  await expect(page.getByTestId("input-username")).toBeVisible();
  const before = f.probes();
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await checkLinks(page, "offline");
  const decoded = await page.evaluate(async () => {
    const img = new Image(); img.src = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href;
    await img.decode(); return [img.naturalWidth, img.naturalHeight];
  });
  expect(decoded).toEqual([32, 32]);
  await page.getByRole("button", { name: "Laman utama", exact: true }).click();
  await expect(brand).toBeVisible();
  await checkLinks(page, "offline");
  await page.clock.fastForward(40_100);
  expect(f.probes()).toBe(before);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await checkLinks(page, "online");
  await page.reload();
  await checkLinks(page, "online");
  expect(f.unexpected).toEqual([]);
  expect(cspErrors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`favicon status transparent 16/32/48 PNGs paint online blue/offline grey without a tile (${theme})`, async ({ page, baseURL }, testInfo) => {
    expect(new URL(baseURL!).hostname).toBe("127.0.0.1");
    // Use an image document so this asset proof does not depend on a backend or polling.
    await page.goto(onlinePng);
    await page.emulateMedia({ colorScheme: theme });
    const samples = await page.evaluate(async theme => {
      const results = [];
      const frame = document.createElement("div");
      frame.style.background = theme === "dark" ? "#111827" : "#ffffff";
      frame.style.padding = "24px"; frame.style.display = "flex"; frame.style.gap = "24px";
      document.body.replaceChildren(frame);
      for (const state of ["online", "offline"]) for (const size of [16, 32, 48]) {
        const img = new Image(); img.src = `/brand/favicon-${state}-v2-${size}.png`; await img.decode();
        img.width = size; img.height = size; frame.appendChild(img);
        const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, size, size).data;
        let blue = 0, visible = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! > 0) {
            visible++;
            if (data[i + 2]! - data[i]! > 40) blue++;
          }
        }
        const corners = [0, size - 1, (size - 1) * size, size * size - 1]
          .map(pixel => data[pixel * 4 + 3]);
        const holeAlpha = data[(Math.floor(size * 0.5) * size + Math.floor(size * 0.42)) * 4 + 3];
        const dotAlpha = data[(Math.floor(size * 0.15) * size + Math.floor(size * 0.91)) * 4 + 3];
        results.push({ state, size, width: img.naturalWidth, height: img.naturalHeight, blue, visible, corners, holeAlpha, dotAlpha });
      }
      return results;
    }, theme);
    for (const sample of samples) {
      expect([sample.width, sample.height]).toEqual([sample.size, sample.size]);
      expect(sample.corners, `${sample.state} ${sample.size}px has no opaque background`).toEqual([0, 0, 0, 0]);
      expect(sample.visible, `${sample.state} ${sample.size}px Q remains visible`).toBeGreaterThan(5);
      expect(sample.visible).toBeLessThan(sample.size * sample.size);
      expect(sample.holeAlpha, `${sample.state} ${sample.size}px Q hole is transparent, not a tile`).toBe(0);
      if (sample.state === "online") {
        expect(sample.blue).toBeGreaterThan(5);
        expect(sample.dotAlpha, `${sample.size}px blue Q retains its decorative dots`).toBeGreaterThan(0);
      } else {
        expect(sample.blue).toBe(0);
        expect(sample.dotAlpha, `${sample.size}px grey Q has no decorative dots`).toBe(0);
      }
    }
    await page.screenshot({ path: testInfo.outputPath(`favicon-sizes-${theme}.png`) });
  });
}
