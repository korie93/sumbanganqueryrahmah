// Manual, offline asset export. User approved resizing their original PNGs;
// never redraw, recolor, crop, remove backgrounds or synthesize this artwork.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sources = [
  { theme: "light", file: "assets/brand/q-mark-light-source.png", sha256: "07e5e47d3a1851200301dc22b49764b6bb174b48843bc2462700ba3c0dc5ea5e" },
  { theme: "dark", file: "assets/brand/q-mark-dark-source.png", sha256: "ba84d8b9b9142727fdb2e88538ed1685a51ca1ccddef872bdc719aab3c111994" },
];
const files = [];
const output = (file, bytes) => {
  writeFileSync(file, bytes);
  files.push({ file, bytes: Buffer.byteLength(bytes), sha256: hash(bytes) });
};
const wrapper = (encoded, mime, size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><title>SQR Q icon</title><image width="${size}" height="${size}" href="data:${mime};base64,${encoded}"/></svg>\n`;
const browser = await chromium.launch(resolvePlaywrightLaunchOptions());
try {
  const page = await browser.newPage();
  // A blank page and data URLs only; this exporter never contacts any server.
  for (const source of sources) {
    const original = readFileSync(source.file);
    assert.equal(hash(original), source.sha256, "Only export the approved original source");
    const sizes = source.theme === "light" ? [128] : [16, 32, 48, 64, 96, 128, 180, 192, 512];
    const exports = await page.evaluate(async ({ data, sizes }) => {
      const image = new Image(); image.src = data; await image.decode();
      if (image.width !== 1254 || image.height !== 1254) throw new Error("Unexpected source geometry");
      const result = {};
      for (const size of sizes) {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, size, size);
        result[size] = canvas.toDataURL("image/png").split(",")[1];
        if (size === 96) result.status = canvas.toDataURL("image/webp", 1).split(",")[1];
      }
      return result;
    }, { data: `data:image/png;base64,${original.toString("base64")}`, sizes });
    output(`client/public/brand/sqr-q-mark-${source.theme}.png`, Buffer.from(exports[128], "base64"));
    if (source.theme === "dark") {
      for (const [name, size] of [["apple-touch-icon-180x180", 180], ["icon-192x192", 192], ["icon-512x512", 512]]) {
        output(`client/public/brand/${name}.png`, Buffer.from(exports[size], "base64"));
      }
      output("client/public/brand/favicon.svg", wrapper(exports[64], "image/png", 64));
      // Preserve the existing independently served SVG URL / Nginx contract.
      output("client/public/brand/sqr-q-status.svg", wrapper(exports.status, "image/webp", 96));
      const frames = [16, 32, 48, 64].map(size => ({ size, png: Buffer.from(exports[size], "base64") }));
      const directory = Buffer.alloc(6 + frames.length * 16);
      directory.writeUInt16LE(1, 2); directory.writeUInt16LE(frames.length, 4);
      let offset = directory.length;
      frames.forEach(({ size, png }, i) => {
        const pos = 6 + i * 16;
        directory[pos] = directory[pos + 1] = size;
        directory.writeUInt16LE(1, pos + 4); directory.writeUInt16LE(32, pos + 6);
        directory.writeUInt32LE(png.length, pos + 8); directory.writeUInt32LE(offset, pos + 12);
        offset += png.length;
      });
      output("client/public/brand/favicon.ico", Buffer.concat([directory, ...frames.map(({ png }) => png)]));
    }
  }
} finally { await browser.close(); }
writeFileSync("assets/brand/q-mark-exports.json", JSON.stringify({ sources, method: "Proportional canvas downsampling only; no crop or recoloring. Status WEBP quality 1 in passive SVG, all other raster exports PNG.", files }, null, 2) + "\n");
console.log(JSON.stringify(files, null, 2));
