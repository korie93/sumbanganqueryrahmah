import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { brotliDecompressSync } from "node:zlib";
import {
  createViteBrotliAssetsPlugin,
  shouldEmitBrotliAsset,
} from "../lib/vite-brotli-assets-plugin.mjs";

test("brotli asset plugin only emits supported asset types above the size threshold", () => {
  assert.equal(
    shouldEmitBrotliAsset("assets/app.js", { sourceByteLength: 2048 }),
    true,
  );
  assert.equal(
    shouldEmitBrotliAsset("assets/icon.png", { sourceByteLength: 2048 }),
    false,
  );
  assert.equal(
    shouldEmitBrotliAsset("assets/tiny.css", { sourceByteLength: 256 }),
    false,
  );
});

test("brotli asset plugin writes compressed sidecar files for compressible build output", async () => {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "sqr-brotli-assets-"));

  try {
    const plugin = createViteBrotliAssetsPlugin({ minimumSizeBytes: 64, quality: 4 });

    plugin.configResolved({
      root: fixtureDir,
      build: {
        outDir: "dist",
      },
    });

    await plugin.writeBundle({ dir: "dist" }, {
      "assets/app.js": {
        fileName: "assets/app.js",
        type: "chunk",
        code: "const message = 'hello from sqr';\n".repeat(64),
      },
      "assets/logo.svg": {
        fileName: "assets/logo.svg",
        type: "asset",
        source: "<svg><text>SQR</text></svg>".repeat(32),
      },
      "assets/photo.png": {
        fileName: "assets/photo.png",
        type: "asset",
        source: Buffer.from("not-compressible-binary"),
      },
    });

    const jsCompressed = readFileSync(path.join(fixtureDir, "dist", "assets", "app.js.br"));
    const svgCompressed = readFileSync(path.join(fixtureDir, "dist", "assets", "logo.svg.br"));

    assert.match(
      brotliDecompressSync(jsCompressed).toString("utf8"),
      /hello from sqr/,
    );
    assert.match(
      brotliDecompressSync(svgCompressed).toString("utf8"),
      /<svg>/,
    );

    assert.throws(
      () => readFileSync(path.join(fixtureDir, "dist", "assets", "photo.png.br")),
      /ENOENT/,
    );
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true });
  }
});
