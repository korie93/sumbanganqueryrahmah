// Manual, offline export from the same approved transparent source as the landing mark.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { resolvePlaywrightLaunchOptions } from "./lib/playwright-chrome.mjs";

const dir = "client/public/brand";
const landing = JSON.parse(readFileSync("assets/brand/sidebar-q-exports.json", "utf8"));
const source = { file: landing.source, sha256: landing.sourceSha256 };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const original = readFileSync(source.file);
assert.equal(hash(original), source.sha256);
const files = [];
function output(file, bytes) {
  writeFileSync(file, bytes);
  files.push({ file, bytes: bytes.length, sha256: hash(bytes) });
}
const wrap = (mime, data, size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><title>SQR Q icon</title><image width="${size}" height="${size}" href="data:${mime};base64,${data}"/></svg>\n`;

const browser = await chromium.launch(resolvePlaywrightLaunchOptions());
try {
  const page = await browser.newPage();
  const frames = await page.evaluate(async ({ data, crop, paddingRatio }) => {
    const image = new Image();
    image.src = data;
    await image.decode();
    const result = {};
    for (const size of [64, 96, 180, 192, 512]) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const pad = size * paddingRatio;
      ctx.drawImage(image, crop.x, crop.y, crop.size, crop.size, pad, pad, size - 2 * pad, size - 2 * pad);
      result[size] = canvas.toDataURL(size === 96 ? "image/webp" : "image/png", 1).split(",")[1];
    }
    return result;
  }, { data: `data:image/png;base64,${original.toString("base64")}`, crop: landing.crop,
    paddingRatio: landing.transparentPadding / landing.size });
  for (const [name, size] of [["apple-touch-icon-180x180", 180], ["icon-192x192", 192], ["icon-512x512", 512]]) {
    output(`${dir}/${name}.png`, Buffer.from(frames[size], "base64"));
  }
  output(`${dir}/favicon.svg`, wrap("image/png", frames[64], 64));
  output(`${dir}/sqr-q-status.svg`, wrap("image/webp", frames[96], 96));
} finally { await browser.close(); }

// Old clients, saved shortcuts and crawlers may still request these public URLs.
const mark = readFileSync(`${dir}/sidebar-q-static.png`);
for (const theme of ["light", "dark"]) output(`${dir}/sqr-q-mark-${theme}.png`, mark);
const ico = readFileSync(`${dir}/favicon-online-v2.ico`);
for (const path of [`${dir}/favicon.ico`, `${dir}/favicon-online-v1.ico`, "client/public/favicon.ico"]) output(path, ico);
for (const state of ["online", "offline"]) {
  for (const size of [16, 32, 48]) {
    output(`${dir}/favicon-${state}-v1-${size}.png`, readFileSync(`${dir}/favicon-${state}-v2-${size}.png`));
  }
}
writeFileSync("assets/brand/q-mark-exports.json", JSON.stringify({
  sources: [source], method: "Transparent landing Q framing at every size. Legacy URLs reuse the landing mark or current connectivity favicon bytes.", files,
}, null, 2) + "\n");
