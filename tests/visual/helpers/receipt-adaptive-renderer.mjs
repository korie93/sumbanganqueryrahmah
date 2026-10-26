import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

const recordId = "synthetic-adaptive-record";
const media = [
  { id: "portrait", fileName: "Synthetic adaptive portrait.png", mimeType: "image/png", width: 2_400, height: 3_600 },
  { id: "landscape", fileName: "Synthetic adaptive landscape.png", mimeType: "image/png", width: 1_800, height: 600 },
  { id: "pdf", fileName: "Synthetic adaptive original.pdf", mimeType: "application/pdf", width: 0, height: 0 },
];

function syntheticRecord() {
  const now = "2026-10-26T08:00:00.000Z";
  return {
    id: recordId, customerName: "Synthetic Adaptive Customer",
    paymentDate: "2026-10-25", amount: "125.00", receiptTotalAmount: "375.00",
    receipts: media.map((entry) => ({
      id: entry.id, collectionRecordId: recordId, storagePath: `/synthetic/${entry.id}`,
      originalFileName: entry.fileName, originalMimeType: entry.mimeType,
      originalExtension: entry.id === "pdf" ? "pdf" : "png", fileSize: 1,
      receiptAmount: "125.00", receiptDate: "2026-10-25", createdAt: now,
    })),
  };
}

async function main() {
  assert.equal(process.argv.length, 3, "Expected one repository root argument");
  const repoRoot = process.argv[2];
  assert.ok(isAbsolute(repoRoot), "Repository root must be absolute");
  const renderer = `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { ReceiptPreviewSession } from "@/pages/collection-records/ReceiptPreviewSession";
    import "@/pages/collection-records/receipt-preview-dialog.css";
    const record = ${JSON.stringify(syntheticRecord())};
    function App() {
      const [request, setRequest] = useState(null);
      return <><button type="button" onClick={() => setRequest({ record })}>Open synthetic receipt</button>
        {request ? <ReceiptPreviewSession request={request} onClose={() => setRequest(null)} /> : null}</>;
    }
    createRoot(document.getElementById("root")).render(<App />);
  `;
  // Import the build tool only in this disposable child, never in the Playwright worker.
  const require = createRequire(join(repoRoot, "package.json"));
  const [{ build }, { default: react }] = await Promise.all([
    import(pathToFileURL(require.resolve("vite")).href),
    import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href),
  ]);
  const entry = join(repoRoot, "tests/visual/receipt-adaptive-virtual-entry.tsx");
  const result = await build({
    configFile: false, envFile: false, mode: "production", root: join(repoRoot, "client"),
    publicDir: false, cacheDir: join(tmpdir(), "sqr-receipt-adaptive-vite-cache"),
    logLevel: "silent", clearScreen: false,
    plugins: [{
      name: "receipt-adaptive-virtual-entry", enforce: "pre",
      resolveId: (id) => id === entry ? entry : undefined,
      load: (id) => id === entry ? renderer : undefined,
    }, react()],
    resolve: {
      alias: [
        { find: /^zod$/, replacement: join(repoRoot, "client/src/lib/zod-browser.ts") },
        { find: "@", replacement: join(repoRoot, "client/src") },
        { find: "@shared", replacement: join(repoRoot, "shared") },
        { find: "react", replacement: join(repoRoot, "node_modules/react") },
      ],
      dedupe: ["react", "react-dom"],
    },
    define: { "process.env.NODE_ENV": JSON.stringify("production"), __SQR_CLIENT_RELEASE_SHA__: JSON.stringify("") },
    css: { postcss: { plugins: [] } },
    build: {
      write: false, emptyOutDir: false, copyPublicDir: false,
      outDir: join(tmpdir(), "sqr-receipt-adaptive-unused-output"), target: "es2022",
      minify: false, cssMinify: false, cssCodeSplit: false, sourcemap: false,
      manifest: false, ssrManifest: false, license: false, reportCompressedSize: false, modulePreload: false,
      lib: { entry, formats: ["es"], fileName: () => "renderer.js", cssFileName: "renderer" },
      rolldownOptions: {
        output: { format: "es", codeSplitting: false, entryFileNames: "renderer.js", assetFileNames: "[name][extname]" },
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  assert.equal(outputs.length, 1);
  const output = outputs[0];
  assert.ok(output && "output" in output && Array.isArray(output.output));
  assert.equal(output.output.length, 2, "Serve only the renderer and receipt CSS");
  const names = new Set();
  let totalBytes = 0;
  const assets = output.output.map((file) => {
    assert.ok(file.fileName === "renderer.js" || file.fileName === "renderer.css");
    assert.equal(names.has(file.fileName), false);
    names.add(file.fileName);
    if (file.type === "chunk") {
      assert.equal(file.fileName, "renderer.js");
      assert.equal(file.isEntry, true);
      assert.equal(file.imports.length, 0, `Unexpected static fixture imports: ${JSON.stringify(file.imports)}`);
      assert.ok(file.dynamicImports.every((name) => name === file.fileName), `Unexpected external fixture imports: ${JSON.stringify(file.dynamicImports)}`);
    } else assert.equal(file.fileName, "renderer.css");
    const body = Buffer.from(file.type === "chunk" ? file.code : file.source);
    totalBytes += body.length;
    assert.ok(body.length > 0 && totalBytes <= 2 * 1024 * 1024, "Synthetic renderer exceeds its 2 MiB bound");
    return {
      name: file.fileName, type: file.fileName.endsWith(".css") ? "text/css" : "text/javascript",
      base64: body.toString("base64"), sha256: createHash("sha256").update(body).digest("hex"),
    };
  });
  assert.ok(names.has("renderer.js") && names.has("renderer.css"));
  const serialized = JSON.stringify({ assets });
  assert.ok(Buffer.byteLength(serialized) <= 3 * 1024 * 1024, "Synthetic renderer JSON exceeds 3 MiB");
  await new Promise((resolve, reject) => process.stdout.write(serialized, (error) => error ? reject(error) : resolve()));
}

try {
  await main();
  process.exit(0);
} catch (error) {
  const diagnostic = error instanceof Error ? error.message : "Synthetic renderer build failed";
  await new Promise((resolve) => process.stderr.write(`${diagnostic.slice(0, 8_192)}\n`, resolve));
  process.exit(1);
}
