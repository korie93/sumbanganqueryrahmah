// Offline, deterministic separation of the approved original pixels; no tracing/redrawing.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Use a preinstalled native canvas for exports only, never ship it to the application.
const modulePath = process.argv[2];
const { createCanvas } = await import(modulePath ? pathToFileURL(modulePath).href : "@napi-rs/canvas");
const { PNG } = await import(process.argv[3] ? pathToFileURL(process.argv[3]).href : "pngjs");
const source = "assets/brand/q-mark-light-source.png";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = readFileSync(source);
assert.equal(sha256(bytes), "07e5e47d3a1851200301dc22b49764b6bb174b48843bc2462700ba3c0dc5ea5e");
const image = PNG.sync.read(bytes);
assert.equal(image.width, 1254); assert.equal(image.height, 1254);
const w = image.width, h = image.height;
const canvas = createCanvas(w, h), ctx = canvas.getContext("2d");
const original = ctx.createImageData(w, h);
original.data.set(image.data);
assert.equal(original.data[3], 0, "The source must remain transparent");
const labels = new Uint8Array(w * h), queue = new Int32Array(w * h), components = [];
for (let i = 0; i < labels.length; i++) {
  if (labels[i] || original.data[i * 4 + 3] < 64) continue;
  const id = components.length + 1;
  assert.ok(id <= 6, "Original component structure changed");
  let head = 0, tail = 1, minX = w, minY = h;
  labels[i] = id; queue[0] = i;
  while (head < tail) {
    const p = queue[head++], x = p % w, y = Math.floor(p / w);
    minX = Math.min(x, minX); minY = Math.min(y, minY);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const next = ny * w + nx;
      if (!labels[next] && original.data[next * 4 + 3] >= 64) {
        labels[next] = id; queue[tail++] = next;
      }
    }
  }
  components.push({ id, pixels: tail, minX, minY });
}
components.sort((a, b) => b.pixels - a.pixels);
assert.equal(components.length, 6);
assert.equal(components[0].pixels, 291412); assert.equal(components[1].pixels, 66504);
const dots = components.slice(2);
const roundDot = dots.find(c => c.pixels === 1700);
const squareDots = dots.filter(c => c !== roundDot).sort((a, b) => a.minY - b.minY);
assert.ok(roundDot); assert.equal(squareDots.length, 3);
const groups = [
  ["body", components.slice(0, 2)], ["dot-1", [squareDots[1]]],
  ["dot-2", [squareDots[0]]], ["dot-3", [squareDots[2]]], ["dot-4", [roundDot]],
];
const outputs = [];
function output(name, result) {
  const file = `client/public/brand/sidebar-q-${name}.png`;
  writeFileSync(file, result);
  outputs.push({ file, bytes: result.length, sha256: sha256(result) });
}
ctx.putImageData(original, 0, 0);
const staticArtwork = createCanvas(128, 128), staticContext = staticArtwork.getContext("2d");
staticContext.imageSmoothingEnabled = true; staticContext.imageSmoothingQuality = "high";
staticContext.drawImage(canvas, 154, 154, 1001, 1001, 4, 4, 120, 120);
output("static", staticArtwork.toBuffer("image/png"));
for (const [name, group] of groups) {
  const ids = new Set(group.map(c => c.id));
  const layer = ctx.createImageData(w, h);
  for (let p = 0; p < labels.length; p++) {
    if (!original.data[p * 4 + 3]) continue;
    let keep = ids.has(labels[p]);
    if (!labels[p] && !keep) {
      const x = p % w, y = Math.floor(p / w);
      for (let dy = -2; dy <= 2 && !keep; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && ids.has(labels[ny * w + nx])) { keep = true; break; }
      }
    }
    if (keep) layer.data.set(original.data.subarray(p * 4, p * 4 + 4), p * 4);
  }
  const isolated = createCanvas(w, h); isolated.getContext("2d").putImageData(layer, 0, 0);
  const target = createCanvas(128, 128), out = target.getContext("2d");
  out.imageSmoothingEnabled = true; out.imageSmoothingQuality = "high";
  // Same crop and transparent padding as the active, user-approved 32px favicon.
  out.drawImage(isolated, 154, 154, 1001, 1001, 4, 4, 120, 120);
  output(name, target.toBuffer("image/png"));
}
// A baked lighting band, clipped by the ORIGINAL body alpha at runtime.
// This does not draw or replace any part of the Q's geometry.
const highlight = createCanvas(128, 128), highlightContext = highlight.getContext("2d");
const band = highlightContext.createLinearGradient(30, 0, 98, 128);
band.addColorStop(0, "rgba(255,255,255,0)"); band.addColorStop(0.38, "rgba(255,255,255,0)");
band.addColorStop(0.5, "rgba(255,255,255,1)"); band.addColorStop(0.62, "rgba(255,255,255,0)");
band.addColorStop(1, "rgba(255,255,255,0)");
highlightContext.fillStyle = band; highlightContext.fillRect(0, 0, 128, 128);
output("sheen", highlight.toBuffer("image/png"));
writeFileSync("assets/brand/sidebar-q-exports.json", `${JSON.stringify({
  source, sourceSha256: sha256(bytes), crop: { x: 154, y: 154, size: 1001 },
  size: 128, transparentPadding: 4, components, outputs,
}, null, 2)}\n`);
console.log(`Exported ${outputs.length} original-artwork images (${outputs.reduce((sum, file) => sum + file.bytes, 0)} bytes); favicon files unchanged.`);
