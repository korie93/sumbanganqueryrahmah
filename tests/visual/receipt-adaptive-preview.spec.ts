import { expect, test, type Locator, type Page } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

// Real hook/dialog, synthetic responses, loopback only, no backend or dotenv.
test.use({ serviceWorkers: "block", screenshot: "off", trace: "off", video: "off" });
const recordId = "synthetic-adaptive-record";
const mobileBudget = { edge: 1_280, pixels: 1_048_576 };
const desktopBudget = { edge: 1_600, pixels: 1_800_000 };
const media = [
  { id: "portrait", fileName: "Synthetic adaptive portrait.png", mimeType: "image/png", width: 2_400, height: 3_600 },
  { id: "landscape", fileName: "Synthetic adaptive landscape.png", mimeType: "image/png", width: 1_800, height: 600 },
  { id: "pdf", fileName: "Synthetic adaptive original.pdf", mimeType: "application/pdf", width: 0, height: 0 },
];
let server: ReturnType<typeof createServer> | undefined;
let origin = "";

type Dimensions = { width: number; height: number };
type AdaptiveWindow = typeof window & {
  adaptiveReceiptUrls: { active: Set<string>; created: string[]; revoked: string[] };
};
type Fixture = {
  errors: string[];
  unexpected: string[];
  views: string[];
  downloads: string[];
  files: Buffer[];
  heldUpgrades: number;
  releasedUpgrades: number;
  heldDownloads: number;
  releasedDownloads: number;
  release: () => void;
};

async function readPrebuiltRenderer(path: string) {
  const limit = 3 * 1024 * 1024;
  assert.ok(isAbsolute(path), "Prebuilt renderer path must be absolute");
  const expected = await lstat(path);
  assert.ok(expected.isFile() && !expected.isSymbolicLink(), "Prebuilt renderer must be a regular file, not a symlink");
  assert.ok(expected.size > 0 && expected.size <= limit, "Prebuilt renderer JSON exceeds its 3 MiB bound");
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const actual = await file.stat();
    assert.ok(actual.isFile() && actual.dev === expected.dev && actual.ino === expected.ino && actual.size === expected.size,
      "Prebuilt renderer changed while opening");
    const buffer = Buffer.alloc(limit + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const { bytesRead } = await file.read(buffer, bytes, buffer.length - bytes, bytes);
      if (!bytesRead) break;
      bytes += bytesRead;
    }
    assert.ok(bytes > 0 && bytes <= limit && bytes === actual.size, "Prebuilt renderer JSON exceeds its bound or changed while reading");
    return buffer.subarray(0, bytes);
  } finally {
    await file.close();
  }
}

async function buildRenderer(repoRoot: string) {
  const osKeys = ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "COMSPEC", "PATHEXT", "USERPROFILE", "HOME"];
  const prebuilt = process.env.SQR_RECEIPT_PREBUILT_RENDERER;
  const stdout = prebuilt ? await readPrebuiltRenderer(prebuilt) : await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--max-old-space-size=256", join(repoRoot, "tests/visual/helpers/receipt-adaptive-renderer.mjs"), repoRoot,
    ], {
      cwd: repoRoot, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...Object.fromEntries(osKeys.filter((key) => process.env[key]).map((key) => [key, process.env[key]])), NODE_ENV: "production" },
    });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let outputBytes = 0;
    let errorBytes = 0;
    let failure: Error | undefined;
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => stop(new Error("Synthetic renderer build exceeded 35 seconds")), 35_000);
    child.on("error", stop);
    child.stdout.once("error", stop);
    child.stderr.once("error", stop);
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 4 * 1024 * 1024) return stop(new Error("Synthetic renderer output exceeds 4 MiB"));
      output.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorBytes += chunk.length;
      if (errorBytes > 32 * 1024) return stop(new Error("Synthetic renderer diagnostics exceed 32 KiB"));
      errors.push(chunk);
    });
    // Wait for process exit and closed streams before Playwright can launch a browser.
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (failure || code !== 0) return reject(failure ?? new Error(`Synthetic renderer build failed (${code ?? signal}): ${Buffer.concat(errors).toString("utf8")}`));
      resolve(Buffer.concat(output));
    });
  });
  const result: unknown = JSON.parse(stdout.toString("utf8"));
  assert.ok(result && typeof result === "object" && "assets" in result && Array.isArray(result.assets));
  assert.equal(result.assets.length, 2, "Serve only the renderer and receipt CSS");
  const assets = new Map<string, { type: string; body: Buffer }>();
  let totalBytes = 0;
  for (const asset of result.assets) {
    assert.ok(asset && typeof asset === "object");
    assert.ok(asset.name === "renderer.js" || asset.name === "renderer.css");
    assert.equal(assets.has(`/${asset.name}`), false);
    assert.equal(asset.type, asset.name.endsWith(".css") ? "text/css" : "text/javascript");
    assert.equal(typeof asset.base64, "string");
    const body = Buffer.from(asset.base64, "base64");
    assert.equal(body.toString("base64"), asset.base64, "Renderer output must use canonical base64");
    totalBytes += body.length;
    assert.ok(body.length > 0 && totalBytes <= 2 * 1024 * 1024, "Synthetic renderer exceeds its 2 MiB bound");
    assert.equal(createHash("sha256").update(body).digest("hex"), asset.sha256);
    assets.set(`/${asset.name}`, { type: asset.type, body });
  }
  assert.ok(assets.has("/renderer.js") && assets.has("/renderer.css"));
  return assets;
}

test.beforeAll(async () => {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const assets = await buildRenderer(repoRoot);
  // Test geometry; production CSS owns the image canvas and rotation.
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic adaptive receipt</title><link rel="stylesheet" href="/renderer.css"><style>
    *{box-sizing:border-box}html,body,#root{height:100%;margin:0}body{font:14px sans-serif}
    [role=dialog]{position:fixed;inset:12px;margin:auto;display:flex;flex-direction:column;width:calc(100vw - 24px);max-width:1152px;height:calc(100vh - 24px);overflow:hidden;padding:12px;background:white;z-index:2}
    [role=dialog]>div{flex-shrink:0}[role=dialog]>[aria-busy]{flex:1;min-height:0;overflow:hidden}
    .h-full{height:100%}.min-h-0{min-height:0}.relative{position:relative}.flex{display:flex}.flex-1{flex:1}.flex-wrap{flex-wrap:wrap}.invisible{visibility:hidden}
    .overflow-auto{overflow:auto}.overflow-x-auto{overflow-x:auto}.receipt-preview-image-scroller{width:100%;height:100%;overflow:auto}
    .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
    button{min-height:28px;margin:2px}button svg{width:16px;height:16px}button:disabled{opacity:.5}
    [hidden]{display:none!important}[data-floating-ai-avoid=true]{display:flex;flex-wrap:wrap;justify-content:flex-end}
    @media(max-width:767px){[role=dialog]{inset:0;width:100vw;height:100vh;max-width:none;padding:8px}}
    </style></head><body><div id="root"></div><script type="module" src="/renderer.js"></script></body></html>`;
  server = createServer((request, response) => {
    if (request.method !== "GET") return void response.writeHead(405).end();
    const path = new URL(request.url!, "http://fixture.invalid").pathname;
    const asset = assets.get(path);
    if (asset) return void response.writeHead(200, { "Content-Type": asset.type, "Cache-Control": "no-store" }).end(asset.body);
    if (path !== "/") return void response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" }).end(html);
  });
  server.on("upgrade", (_request, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server!.close((error) => error ? reject(error) : resolve());
    server!.closeAllConnections();
  });
});

async function syntheticPng(page: Page, width: number, height: number, color: string) {
  return Buffer.from(await page.evaluate(({ width, height, color }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f8fafc"; context.fillRect(0, 0, width, height);
    context.fillStyle = color;
    for (let row = 0; row < 24; row++) context.fillRect(40, 40 + row * 40, width - 80, 12);
    const result = canvas.toDataURL("image/png").split(",")[1]!;
    canvas.width = 0; canvas.height = 0;
    return result;
  }, { width, height, color }), "base64");
}

async function installFixture(page: Page, options: { holdUpgrade?: boolean; holdDownload?: boolean; failUpgrade?: "http" | "decode" } = {}): Promise<Fixture> {
  const files = [] as Buffer[];
  for (const [index, entry] of media.entries()) files.push(entry.id === "pdf"
    ? Buffer.from("%PDF-1.4\n% Synthetic fixture: PDF is not opened by these image tests.\n%%EOF\n")
    : await syntheticPng(page, entry.width, entry.height, index ? "#4338ca" : "#0f766e"));
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fixture: Fixture = {
    errors: [], unexpected: [], views: [], downloads: [], files,
    heldUpgrades: 0, releasedUpgrades: 0, heldDownloads: 0, releasedDownloads: 0, release,
  };
  await page.addInitScript(({ fixtureOrigin }) => {
    if (window !== window.top || location.origin !== fixtureOrigin) return;
    // The OS sandbox exposes loopback only. Its synthetic API is available even
    // when Chromium reports the lack of an external interface as offline.
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    const state = { active: new Set<string>(), created: [] as string[], revoked: [] as string[] };
    (window as AdaptiveWindow).adaptiveReceiptUrls = state;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const source = create(blob);
      state.active.add(source); state.created.push(source);
      return source;
    };
    URL.revokeObjectURL = (source) => {
      state.active.delete(source); state.revoked.push(source);
      revoke(source);
    };
  }, { fixtureOrigin: origin });
  page.on("pageerror", (error) => fixture.errors.push(error.message));
  await page.context().routeWebSocket("**/*", (socket) => {
    fixture.unexpected.push("Unexpected WebSocket"); socket.close();
  });
  await page.context().route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && request.method() === "GET" && ["/", "/renderer.js", "/renderer.css"].includes(url.pathname)) return route.continue();
    for (const [index, entry] of media.entries()) for (const action of ["view", "download"] as const) {
      if (url.origin !== origin || request.method() !== "GET" || url.pathname !== `/api/collection/${recordId}/receipts/${entry.id}/${action}` || url.search) continue;
      const calls = action === "view" ? fixture.views : fixture.downloads;
      calls.push(entry.id);
      const isFirstUpgrade = action === "view" && entry.id === "portrait" && calls.filter((id) => id === entry.id).length === 2;
      if (isFirstUpgrade && options.holdUpgrade) {
        fixture.heldUpgrades++;
        await gate;
      }
      const isHeldDownload = action === "download" && options.holdDownload;
      if (isHeldDownload) {
        fixture.heldDownloads++;
        await gate;
      }
      try {
        if (isFirstUpgrade && options.failUpgrade === "http") return await route.fulfill({
          status: 500, json: { ok: false, message: "Synthetic clearer preview unavailable" }, headers: { "Cache-Control": "no-store" },
        });
        if (isFirstUpgrade && options.failUpgrade === "decode") return await route.fulfill({
          status: 200, body: "Synthetic invalid image bytes", contentType: "image/png", headers: { "Cache-Control": "no-store" },
        });
        await route.fulfill({
          status: 200, body: files[index]!, contentType: entry.mimeType,
          headers: { "Cache-Control": "no-store", "Content-Disposition": `${action === "view" ? "inline" : "attachment"}; filename="${entry.fileName}"` },
        });
      } catch (error) {
        // A held fetch may already be canceled by closing/switching.
        if (!request.failure() && !page.isClosed()) throw error;
      } finally {
        if (isFirstUpgrade && options.holdUpgrade) fixture.releasedUpgrades++;
        if (isHeldDownload) fixture.releasedDownloads++;
      }
      return;
    }
    fixture.unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
    return route.abort();
  });
  await page.goto(origin);
  await expect(page.getByRole("button", { name: "Open synthetic receipt", exact: true })).toBeVisible();
  expect(fixture.views).toEqual([]);
  expect(fixture.downloads).toEqual([]);
  return fixture;
}

async function openPreview(page: Page) {
  await page.getByRole("button", { name: "Open synthetic receipt", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Receipt Preview", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function readyImage(dialog: Locator, index = 0) {
  const image = dialog.getByRole("img", { name: media[index]!.fileName, exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  return image;
}

async function dimensions(image: Locator): Promise<Dimensions> {
  return image.evaluate((element) => ({ width: (element as HTMLImageElement).naturalWidth, height: (element as HTMLImageElement).naturalHeight }));
}

function expectBudget(size: Dimensions, budget: { edge: number; pixels: number }) {
  expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(budget.edge);
  expect(size.width * size.height).toBeLessThanOrEqual(budget.pixels);
}

async function activeUrls(page: Page) {
  return page.evaluate(() => Array.from((window as AdaptiveWindow).adaptiveReceiptUrls.active));
}

async function expectOnlySource(page: Page, image: Locator) {
  const source = await image.getAttribute("src");
  expect(source).toMatch(/^blob:http:\/\/127\.0\.0\.1:/);
  await expect.poll(() => activeUrls(page)).toEqual([source]);
  return source!;
}

async function settleReleasedUpgrade(page: Page, fixture: Fixture) {
  fixture.release();
  await expect.poll(() => fixture.releasedUpgrades).toBe(1);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function closePreview(page: Page, dialog: Locator) {
  await dialog.locator('[data-floating-ai-avoid="true"]').getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => activeUrls(page)).toEqual([]);
}

function expectSafe(fixture: Fixture) {
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
}

test("Adaptive receipt preview uses a smaller mobile image, upgrades once without resetting controls, and downloads original bytes", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 740 });
  const fixture = await installFixture(page);
  const dialog = await openPreview(page);
  let image = await readyImage(dialog);
  const compact = await dimensions(image);
  expectBudget(compact, mobileBudget);
  const compactSource = await expectOnlySource(page, image);
  await dialog.getByRole("button", { name: "Rotate receipt clockwise", exact: true }).click();
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(dialog.getByText("110% fit", { exact: true })).toBeVisible();
  await expect.poll(() => fixture.views).toEqual(["portrait", "portrait"]);
  try {
    await expect.poll(async () => { const size = await dimensions(await readyImage(dialog)); return size.width * size.height; }).toBeGreaterThan(compact.width * compact.height);
  } catch (cause) {
    const status = (await dialog.getByRole("status").allTextContents()).slice(0, 6).map((text) => text.slice(0, 200));
    throw new Error(`Synthetic detail diagnostics: ${JSON.stringify({ views: fixture.views, status, errors: fixture.errors, unexpected: fixture.unexpected })}; ${String(cause)}`);
  }
  image = await readyImage(dialog);
  expectBudget(await dimensions(image), desktopBudget);
  await expect(dialog.getByText("110% fit", { exact: true })).toBeVisible();
  await expect(image).toHaveCSS("--receipt-preview-rotation", "90deg");
  expect(await expectOnlySource(page, image)).not.toBe(compactSource);
  for (let step = 0; step < 4; step++) await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(dialog.getByText("150% fit", { exact: true })).toBeVisible();
  expect(fixture.views).toEqual(["portrait", "portrait"]);
  const downloadEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download Original", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("Synthetic_adaptive_portrait.png");
  expect(await readFile((await download.path())!)).toEqual(fixture.files[0]);
  expect(fixture.downloads).toEqual(["portrait"]);
  await expectOnlySource(page, image);
  expect(fixture.views).toEqual(["portrait", "portrait"]);
  await closePreview(page, dialog);
  expectSafe(fixture);
});

test("Adaptive receipt preview keeps desktop detail across resizing without refetching", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const fixture = await installFixture(page);
  const desktopDialog = await openPreview(page);
  const image = await readyImage(desktopDialog);
  const desktop = await dimensions(image);
  expectBudget(desktop, desktopBudget);
  expect(desktop.width * desktop.height).toBeGreaterThan(mobileBudget.pixels);
  await expect(desktopDialog.getByText("100% fit", { exact: true })).toBeVisible();
  const source = await expectOnlySource(page, image);
  await page.setViewportSize({ width: 393, height: 740 });
  await expect(image).toHaveAttribute("src", source);
  expect(await dimensions(image)).toEqual(desktop);
  await desktopDialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(desktopDialog.getByText("110% fit", { exact: true })).toBeVisible();
  expect(fixture.views).toEqual(["portrait"]);
  await closePreview(page, desktopDialog);
  expectSafe(fixture);
});

test("Adaptive receipt preview ignores a pending upgrade after Escape and reopens with the compact image", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 740 });
  const fixture = await installFixture(page, { holdUpgrade: true });
  try {
    const dialog = await openPreview(page);
    const compact = await dimensions(await readyImage(dialog));
    await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(() => fixture.heldUpgrades).toBe(1);
    await expect(dialog.getByRole("status").filter({ hasText: "Preparing a clearer preview" })).toBeVisible();
    await expect(await readyImage(dialog)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => activeUrls(page)).toEqual([]);
    await settleReleasedUpgrade(page, fixture);
    await expect(page.getByRole("img")).toHaveCount(0);
    await expect.poll(() => activeUrls(page)).toEqual([]);
    const reopened = await openPreview(page);
    const image = await readyImage(reopened);
    expect(await dimensions(image)).toEqual(compact);
    await expect(reopened.getByText("100% fit", { exact: true })).toBeVisible();
    await expect(image).toHaveCSS("--receipt-preview-rotation", "0deg");
    await expectOnlySource(page, image);
    expect(fixture.views).toEqual(["portrait", "portrait", "portrait"]);
    await closePreview(page, reopened);
    expectSafe(fixture);
  } finally { fixture.release(); }
});

test("Adaptive receipt preview cancels a delayed original download on close and reopens without leaking URLs", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 740 });
  const fixture = await installFixture(page, { holdDownload: true });
  const startedDownloads: string[] = [];
  page.on("download", (download) => startedDownloads.push(download.suggestedFilename()));
  try {
    const dialog = await openPreview(page);
    const compact = await dimensions(await readyImage(dialog));
    await expectOnlySource(page, await readyImage(dialog));
    await dialog.getByRole("button", { name: "Download Original", exact: true }).click();
    await expect.poll(() => fixture.heldDownloads).toBe(1);
    expect(fixture.downloads).toEqual(["portrait"]);
    await closePreview(page, dialog);
    const createdBeforeRelease = await page.evaluate(() => (window as AdaptiveWindow).adaptiveReceiptUrls.created.length);
    fixture.release();
    await expect.poll(() => fixture.releasedDownloads).toBe(1);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(startedDownloads).toEqual([]);
    await expect(page.getByRole("img")).toHaveCount(0);
    await expect.poll(() => activeUrls(page)).toEqual([]);
    expect(await page.evaluate(() => (window as AdaptiveWindow).adaptiveReceiptUrls.created.length)).toBe(createdBeforeRelease);
    const reopened = await openPreview(page);
    const image = await readyImage(reopened);
    expect(await dimensions(image)).toEqual(compact);
    await expect(reopened.getByText("100% fit", { exact: true })).toBeVisible();
    await expectOnlySource(page, image);
    await expect(reopened.getByRole("button", { name: "Download Original", exact: true })).toBeEnabled();
    await closePreview(page, reopened);
    expect(startedDownloads).toEqual([]);
    expect(fixture.downloads).toEqual(["portrait"]);
    const urls = await page.evaluate(() => {
      const state = (window as AdaptiveWindow).adaptiveReceiptUrls;
      return { created: state.created, revoked: state.revoked };
    });
    for (const source of urls.created) expect(urls.revoked).toContain(source);
    expectSafe(fixture);
  } finally { fixture.release(); }
});

test("Adaptive receipt preview cannot publish an old upgrade after switching receipts and releases every replaced URL", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 740 });
  const fixture = await installFixture(page, { holdUpgrade: true });
  try {
    const dialog = await openPreview(page);
    const first = await readyImage(dialog);
    const firstSource = await expectOnlySource(page, first);
    await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(() => fixture.heldUpgrades).toBe(1);
    await dialog.getByRole("button", { name: `Receipt 2: ${media[1]!.fileName}`, exact: true }).click();
    const second = await readyImage(dialog, 1);
    const secondSource = await expectOnlySource(page, second);
    expect(secondSource).not.toBe(firstSource);
    expectBudget(await dimensions(second), mobileBudget);
    await settleReleasedUpgrade(page, fixture);
    await expect(second).toHaveAttribute("src", secondSource);
    await expect(dialog.getByRole("img", { name: media[0]!.fileName, exact: true })).toHaveCount(0);
    await expect(dialog.getByText("100% fit", { exact: true })).toBeVisible();
    await expectOnlySource(page, second);
    expect(fixture.views).toEqual(["portrait", "portrait", "landscape"]);
    await closePreview(page, dialog);
    const urls = await page.evaluate(() => {
      const state = (window as AdaptiveWindow).adaptiveReceiptUrls;
      return { created: state.created, revoked: state.revoked };
    });
    for (const source of urls.created) expect(urls.revoked).toContain(source);
    expectSafe(fixture);
  } finally { fixture.release(); }
});

for (const failure of ["http", "decode"] as const) test(`Adaptive receipt preview keeps its image after ${failure} refinement failure and retries`, async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 740 });
  const fixture = await installFixture(page, { failUpgrade: failure });
  const dialog = await openPreview(page);
  const image = await readyImage(dialog);
  const compact = await dimensions(image);
  const compactSource = await expectOnlySource(page, image);
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  const retry = dialog.getByRole("button", { name: /retry/i });
  await expect(retry).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: "Clearer preview is unavailable" })).toBeVisible();
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", compactSource);
  await expect(dialog.getByText("110% fit", { exact: true })).toBeVisible();
  await expectOnlySource(page, image);
  expect(fixture.views).toEqual(["portrait", "portrait"]);
  await retry.click();
  await expect.poll(async () => { const size = await dimensions(await readyImage(dialog)); return size.width * size.height; }).toBeGreaterThan(compact.width * compact.height);
  const refined = await readyImage(dialog);
  expectBudget(await dimensions(refined), desktopBudget);
  await expect(dialog.getByText("110% fit", { exact: true })).toBeVisible();
  await expect(retry).toHaveCount(0);
  await expectOnlySource(page, refined);
  expect(fixture.views).toEqual(["portrait", "portrait", "portrait"]);
  await closePreview(page, dialog);
  expectSafe(fixture);
});
