import { expect, test, type Locator, type Page } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build } from "vite";
import { isChromiumPdfViewerResource } from "./helpers/chromium-pdf-resources";

// Build before Playwright creates a browser fixture, keeping build and browser
// memory apart. Development React is required to exercise StrictMode replay.
test.use({ serviceWorkers: "block" });
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 3 * 1024 * 1024;
let server: ReturnType<typeof createServer> | undefined;
let origin = "";

type Removal = { attribute: string; connected: boolean; source: string | null };
type LifecycleWindow = typeof window & {
  receiptLifecycle: {
    show: (kind: "image" | "pdf", index?: number) => void;
    unmount: () => void;
    source: (kind: "image" | "pdf", index?: number) => string;
    replay: { setups: number; cleanups: number };
  };
  trackedReceipt: HTMLImageElement | HTMLIFrameElement;
  receiptRemovals: Removal[];
};

function syntheticPdf(): Buffer {
  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  const stream = "BT /F1 16 Tf 30 220 Td (Synthetic lifecycle fixture) Tj ET\n";
  for (const [index, body] of [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ].entries()) {
    offsets.push(Buffer.byteLength(parts.join("")));
    parts.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  }
  const xref = Buffer.byteLength(parts.join(""));
  parts.push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.from(parts.join(""));
}

test.beforeAll(async () => {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const entry = join(repoRoot, "tests/visual/receipt-lifecycle-virtual-entry.tsx");
  const renderer = `
    import React, { useEffect } from "react";
    import { createRoot } from "react-dom/client";
    import { ReceiptPreviewContent } from "@/pages/collection-records/ReceiptPreviewContent";
    import "@/pages/collection-records/receipt-preview-dialog.css";
    async function start() {
      const images = await Promise.all([[240, 720], [320, 160]].map(async ([width, height]) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#0f766e";
        context.fillRect(0, 0, width, height);
        const blob = await new Promise((resolve, reject) => canvas.toBlob(
          (value) => value ? resolve(value) : reject(new Error("Synthetic PNG generation failed")), "image/png"
        ));
        return URL.createObjectURL(blob);
      }));
      const pdfBytes = Uint8Array.from(atob(${JSON.stringify(syntheticPdf().toString("base64"))}), (value) => value.charCodeAt(0));
      const pdf = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
      let root = null;
      const control = {
        replay: { setups: 0, cleanups: 0 },
        source: (kind, index = 0) => kind === "image" ? images[index] : pdf,
        show(kind, index = 0) {
          if (!root) {
            control.replay = { setups: 0, cleanups: 0 };
            root = createRoot(document.getElementById("root"));
          }
          root.render(<React.StrictMode><ReplayProbe /><ReceiptPreviewContent
            loading={false} error="" safeSource={control.source(kind, index)} hasUnsafeSource={false}
            showPdfFallback={false} kind={kind} isMobile={false} zoomValue="1" rotationDegrees={0}
            fileName={"Synthetic lifecycle receipt." + (kind === "image" ? "png" : "pdf")} selectedReceipt={null}
          /></React.StrictMode>);
        },
        unmount() { root?.unmount(); root = null; },
      };
      function ReplayProbe() {
        useEffect(() => {
          control.replay.setups++;
          return () => { control.replay.cleanups++; };
        }, []);
        return null;
      }
      window.addEventListener("pagehide", () => [...images, pdf].forEach((source) => URL.revokeObjectURL(source)), { once: true });
      window.receiptLifecycle = control;
      control.show(new URLSearchParams(location.search).get("kind") === "pdf" ? "pdf" : "image");
    }
    start().catch((error) => { console.error(error); setTimeout(() => { throw error; }); });
  `;
  const result = await build({
    configFile: false,
    envFile: false,
    mode: "development",
    root: join(repoRoot, "client"),
    publicDir: false,
    cacheDir: join(tmpdir(), "sqr-receipt-lifecycle-vite-cache"),
    logLevel: "silent",
    clearScreen: false,
    plugins: [
      {
        name: "receipt-lifecycle-virtual-entry",
        enforce: "pre",
        resolveId: (id) => id === entry ? entry : undefined,
        load: (id) => id === entry ? renderer : undefined,
      },
      react(),
    ],
    resolve: {
      alias: { "@": join(repoRoot, "client/src"), react: join(repoRoot, "node_modules/react") },
      dedupe: ["react", "react-dom"],
    },
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    css: { postcss: { plugins: [] } },
    build: {
      write: false,
      emptyOutDir: false,
      copyPublicDir: false,
      outDir: join(tmpdir(), "sqr-receipt-lifecycle-unused-output"),
      target: "es2022",
      minify: "oxc",
      cssMinify: "lightningcss",
      cssCodeSplit: false,
      sourcemap: false,
      manifest: false,
      ssrManifest: false,
      license: false,
      reportCompressedSize: false,
      modulePreload: false,
      lib: { entry, formats: ["es"], fileName: () => "renderer.js", cssFileName: "renderer" },
      rolldownOptions: {
        output: { format: "es", codeSplitting: false, entryFileNames: "renderer.js", assetFileNames: "[name][extname]" },
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  assert.equal(outputs.length, 1, "One in-memory ES build is required");
  const output = outputs[0];
  assert.ok(output && "output" in output && Array.isArray(output.output));
  assert.equal(output.output.length, 2, "Only the renderer and receipt CSS may be served");
  const assets = new Map<string, { type: string; body: Buffer }>();
  let totalBytes = 0;
  for (const file of output.output) {
    assert.ok(file.fileName === "renderer.js" || file.fileName === "renderer.css");
    assert.equal(assets.has(`/${file.fileName}`), false);
    let body: Buffer;
    if (file.type === "chunk") {
      assert.equal(file.fileName, "renderer.js");
      assert.equal(file.isEntry, true);
      assert.equal(file.imports.length, 0);
      assert.equal(file.dynamicImports.length, 0);
      body = Buffer.from(file.code);
    } else {
      assert.equal(file.fileName, "renderer.css");
      body = Buffer.from(file.source);
    }
    assert.ok(body.length > 0 && body.length <= MAX_ASSET_BYTES, "Renderer asset exceeds its bound");
    totalBytes += body.length;
    assert.ok(totalBytes <= MAX_TOTAL_ASSET_BYTES, "Renderer exceeds its total asset bound");
    assets.set(`/${file.fileName}`, { type: file.fileName.endsWith(".css") ? "text/css" : "text/javascript", body });
  }
  assert.ok(assets.has("/renderer.js") && assets.has("/renderer.css"));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Synthetic receipt lifecycle</title><link rel="stylesheet" href="/renderer.css"><style>html,body,#root,#root>div,.h-full{height:100%;margin:0}.receipt-preview-image-scroller{height:100%;padding:12px;overflow:auto}.invisible{visibility:hidden}iframe{height:100%;width:100%;border:0}</style></head><body><div id="root"></div><script type="module" src="/renderer.js"></script></body></html>`;
  server = createServer((request, response) => {
    if (request.method !== "GET") return void response.writeHead(405).end();
    const path = new URL(request.url!, "http://fixture.invalid").pathname;
    const asset = assets.get(path);
    if (asset) return void response.writeHead(200, { "Content-Type": asset.type, "Cache-Control": "no-store" }).end(asset.body);
    if (path !== "/") return void response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" }).end(html);
  });
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

async function openFixture(page: Page, kind: "image" | "pdf") {
  const errors: string[] = [];
  const unexpected: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.context().routeWebSocket("**/*", (socket) => socket.close());
  await page.context().route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (isChromiumPdfViewerResource(url)) return route.continue();
    if (url.origin === origin && route.request().method() === "GET" && ["/", "/renderer.js", "/renderer.css"].includes(url.pathname)) return route.continue();
    unexpected.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort();
  });
  await page.goto(`${origin}/?kind=${kind}`);
  // Prevent production React from passing without exercising replay cleanup.
  await expect.poll(() => page.evaluate(() => (window as LifecycleWindow).receiptLifecycle?.replay)).toEqual({ setups: 2, cleanups: 1 });
  return { errors, unexpected };
}

async function expectDecodedImage(page: Page, width: number) {
  const image = page.getByRole("img", { name: "Synthetic lifecycle receipt.png", exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(width);
  await expect(page.getByRole("status").filter({ hasText: "Loading receipt image" })).toHaveCount(0);
  return image;
}

async function trackSourceRemoval(media: Locator) {
  await media.evaluate((element) => {
    const scope = window as LifecycleWindow;
    scope.trackedReceipt = element as HTMLImageElement | HTMLIFrameElement;
    scope.receiptRemovals = [];
    const removeAttribute = element.removeAttribute;
    // Observe this real element without replacing browser-wide prototypes or
    // reproducing the component's effect in the test.
    element.removeAttribute = function (attribute) {
      removeAttribute.call(this, attribute);
      scope.receiptRemovals.push({ attribute, connected: this.isConnected, source: this.getAttribute("src") });
    };
  });
}

async function trackedState(page: Page) {
  return page.evaluate(() => {
    const scope = window as LifecycleWindow;
    return { connected: scope.trackedReceipt.isConnected, source: scope.trackedReceipt.getAttribute("src"), removals: scope.receiptRemovals };
  });
}

test("Receipt images survive StrictMode replay and release sources before keyed replacement and unmount", async ({ page }) => {
  const fixture = await openFixture(page, "image");
  let image = await expectDecodedImage(page, 240);
  await expect(image).toHaveAttribute("src", await page.evaluate(() => (window as LifecycleWindow).receiptLifecycle.source("image")));
  await trackSourceRemoval(image);
  await page.evaluate(() => (window as LifecycleWindow).receiptLifecycle.show("image", 1));
  image = await expectDecodedImage(page, 320);
  expect(await trackedState(page)).toEqual({ connected: false, source: null, removals: [{ attribute: "src", connected: true, source: null }] });
  await expect(image).toHaveAttribute("src", await page.evaluate(() => (window as LifecycleWindow).receiptLifecycle.source("image", 1)));

  await trackSourceRemoval(image);
  await page.evaluate(() => (window as LifecycleWindow).receiptLifecycle.unmount());
  expect(await trackedState(page)).toEqual({ connected: false, source: null, removals: [{ attribute: "src", connected: true, source: null }] });
  await expect(page.locator("#root")).toBeEmpty();

  await page.evaluate(() => (window as LifecycleWindow).receiptLifecycle.show("image"));
  await expect.poll(() => page.evaluate(() => (window as LifecycleWindow).receiptLifecycle.replay)).toEqual({ setups: 2, cleanups: 1 });
  image = await expectDecodedImage(page, 240);
  await trackSourceRemoval(image);
  await page.evaluate(() => (window as LifecycleWindow).receiptLifecycle.unmount());
  expect(await trackedState(page)).toEqual({ connected: false, source: null, removals: [{ attribute: "src", connected: true, source: null }] });
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test("Receipt PDFs restore their source after StrictMode replay and navigate to blank on unmount", async ({ page }) => {
  const fixture = await openFixture(page, "pdf");
  const frame = page.locator('iframe[title="Receipt PDF Preview"]');
  await expect(frame).toHaveAttribute("src", await page.evaluate(() => (window as LifecycleWindow).receiptLifecycle.source("pdf")));
  await expect(page.getByRole("status").filter({ hasText: "Opening PDF preview" })).toHaveCount(0);
  await trackSourceRemoval(frame);
  await page.evaluate(() => (window as LifecycleWindow).receiptLifecycle.unmount());
  const state = await trackedState(page);
  expect(state.connected).toBe(false);
  expect(state.source).toBe("about:blank");
  expect(state.removals).toHaveLength(1);
  expect(state.removals[0]).toMatchObject({ attribute: "src", source: null });
  await expect(page.locator("#root")).toBeEmpty();
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
