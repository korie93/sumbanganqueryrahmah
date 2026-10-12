// Offline export of the user's original transparent Q, without AI redrawing.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

const source = { file: "assets/brand/q-mark-light-source.png", sha256: "07e5e47d3a1851200301dc22b49764b6bb174b48843bc2462700ba3c0dc5ea5e" };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const original = readFileSync(source.file);
assert.equal(hash(original), source.sha256, "Only use the approved original transparent artwork");
const browser = await chromium.launch(resolvePlaywrightLaunchOptions());
let exported;
try {
  const page = await browser.newPage();
  // All content is local/data-URL; no application, API or external requests.
  exported = await page.evaluate(async dataUrl => {
    const image = new Image(); image.src = dataUrl; await image.decode();
    if (image.width !== 1254 || image.height !== 1254) throw new Error("Unexpected source dimensions");
    const w = image.width, h = image.height;
    const online = document.createElement("canvas"); online.width = w; online.height = h;
    const context = online.getContext("2d"); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, w, h);
    if (pixels.data[3] !== 0) throw new Error("Source must have a transparent background");
    // Identify the original, separate shapes without tracing or altering geometry.
    const labels = new Uint8Array(w * h), queue = new Int32Array(w * h), components = [];
    for (let i = 0; i < w * h; i++) {
      if (labels[i] || pixels.data[i * 4 + 3] < 64) continue;
      const id = components.length + 1;
      if (id > 6) throw new Error("Source component structure changed");
      let start = 0, end = 1, minX = w, minY = h, maxX = 0, maxY = 0;
      labels[i] = id; queue[0] = i;
      while (start < end) {
        const p = queue[start++], x = p % w, y = Math.floor(p / w);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const next = ny * w + nx;
          if (!labels[next] && pixels.data[next * 4 + 3] >= 64) { labels[next] = id; queue[end++] = next; }
        }
      }
      components.push({ id, pixels: end, minX, minY, maxX, maxY });
    }
    components.sort((a, b) => b.pixels - a.pixels);
    if (components.length !== 6 || components[0].pixels !== 291412 || components[1].pixels !== 66504) {
      throw new Error("Expected original Q ring/tail and four detached decorative shapes");
    }
    const bodyIds = new Set(components.slice(0, 2).map(c => c.id));
    const grey = new ImageData(new Uint8ClampedArray(pixels.data), w, h);
    for (let i = 0; i < w * h; i++) {
      if (grey.data[i * 4 + 3] === 0) continue;
      let keep = bodyIds.has(labels[i]);
      // Retain the Q's low-alpha antialiased boundary within two source pixels.
      if (!labels[i] && !keep) {
        const x = i % w, y = Math.floor(i / w);
        for (let dy = -2; dy <= 2 && !keep; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && bodyIds.has(labels[ny * w + nx])) { keep = true; break; }
        }
      }
      if (!keep) { grey.data[i * 4 + 3] = 0; continue; }
      const luminance = 0.2126 * grey.data[i * 4] + 0.7152 * grey.data[i * 4 + 1] + 0.0722 * grey.data[i * 4 + 2];
      const value = Math.round(72 + 0.55 * luminance);
      grey.data[i * 4] = grey.data[i * 4 + 1] = grey.data[i * 4 + 2] = value;
    }
    const offline = document.createElement("canvas"); offline.width = w; offline.height = h;
    offline.getContext("2d").putImageData(grey, 0, 0);
    const minX = Math.min(...components.map(c => c.minX)), maxX = Math.max(...components.map(c => c.maxX));
    const minY = Math.min(...components.map(c => c.minY)), maxY = Math.max(...components.map(c => c.maxY));
    // Crop transparent padding only; common square bounds preserve size/position on transitions.
    const extent = Math.max(maxX - minX + 1, maxY - minY + 1) + 48;
    const crop = { x: (minX + maxX + 1 - extent) / 2, y: (minY + maxY + 1 - extent) / 2, size: extent };
    const result = { online: {}, offline: {}, crop, components };
    for (const [state, sourceCanvas] of [["online", online], ["offline", offline]]) {
      for (const size of [16, 32, 48, 64, 128]) {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        // One clear output pixel prevents the tiny upper dot from touching the
        // tab-icon edge; this is transparent spacing, not a visible frame.
        ctx.drawImage(sourceCanvas, crop.x, crop.y, crop.size, crop.size, 1, 1, size - 2, size - 2);
        result[state][size] = canvas.toDataURL("image/png").split(",")[1];
      }
    }
    return result;
  }, `data:image/png;base64,${original.toString("base64")}`);
} finally { await browser.close(); }

const files = [];
function output(file, bytes) {
  writeFileSync(file, bytes);
  files.push({ file, bytes: bytes.length, sha256: hash(bytes) });
}
for (const state of ["online", "offline"]) for (const size of [16, 32, 48]) {
  output(`client/public/brand/favicon-${state}-v2-${size}.png`, Buffer.from(exported[state][size], "base64"));
}
output("client/src/assets/favicon-status/offline-32.png", Buffer.from(exported.offline[32], "base64"));
const frames = [16, 32, 48, 64].map(size => ({ size, png: Buffer.from(exported.online[size], "base64") }));
const directory = Buffer.alloc(6 + 16 * frames.length);
directory.writeUInt16LE(1, 2); directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;
frames.forEach(({ size, png }, index) => {
  const p = 6 + index * 16;
  directory[p] = directory[p + 1] = size; directory.writeUInt16LE(1, p + 4); directory.writeUInt16LE(32, p + 6);
  directory.writeUInt32LE(png.length, p + 8); directory.writeUInt32LE(offset, p + 12); offset += png.length;
});
output("client/public/brand/favicon-online-v2.ico", Buffer.concat([directory, ...frames.map(f => f.png)]));
writeFileSync("assets/brand/favicon-status-provenance.json", JSON.stringify({
  sources: [source],
  method: "Original transparent Q; common square crop removes transparent padding only, with one transparent output pixel of edge spacing. Online colors unchanged. Offline keeps original Q ring/tail alpha, removes four detached decorative shapes and applies a neutral grey gradient. Canvas downsampling only; no AI redraw, tile, frame or background.",
  crop: exported.crop, components: exported.components, files,
}, null, 2) + "\n");
for (const state of ["online", "offline"]) writeFileSync(`artifacts/favicon-${state}-transparent-preview.png`, Buffer.from(exported[state][128], "base64"));
console.log(JSON.stringify({ crop: exported.crop, files }, null, 2));
