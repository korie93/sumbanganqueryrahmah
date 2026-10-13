import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url));

test("sidebar Q exports retain approved original provenance and bounded transparent PNG layers", () => {
  const manifest = JSON.parse(read("assets/brand/sidebar-q-exports.json"));
  assert.equal(manifest.source, "assets/brand/q-mark-light-source.png");
  assert.equal(manifest.sourceSha256, "07e5e47d3a1851200301dc22b49764b6bb174b48843bc2462700ba3c0dc5ea5e");
  assert.equal(hash(read(manifest.source)), manifest.sourceSha256);
  assert.deepEqual(manifest.outputs.map(file => file.file), ["static", "body", "dot-1", "dot-2", "dot-3", "dot-4", "sheen"].map(name => `client/public/brand/sidebar-q-${name}.png`));
  assert.ok(manifest.outputs.reduce((sum, file) => sum + file.bytes, 0) < 30_000);
  for (const output of manifest.outputs) {
    const bytes = read(output.file);
    assert.equal(hash(bytes), output.sha256);
    assert.equal(bytes.length, output.bytes);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16), 128); assert.equal(bytes.readUInt32BE(20), 128);
    assert.equal(bytes[25], 6, "RGBA retains transparency, no background tile");
  }
});

test("sidebar Q keyframes animate only transform and opacity, with no runtime frame loop", () => {
  const css = read("client/src/components/SidebarAnimatedQ.css").toString();
  const keyframes = css.match(/@keyframes[\s\S]*?(?=\n@keyframes|\n\.sidebar-q-artwork\[data-motion="reduced"\])/g);
  assert.equal(keyframes.length, 5);
  for (const keyframe of keyframes) {
    const properties = [...keyframe.matchAll(/([\w-]+)\s*:/g)].map(match => match[1]);
    assert.ok(properties.every(property => ["transform", "opacity"].includes(property)), properties.join(","));
  }
  const component = read("client/src/components/SidebarAnimatedQ.tsx").toString();
  assert.doesNotMatch(component, /requestAnimationFrame|setInterval|setTimeout|<canvas|<video|<svg|dangerouslySetInnerHTML/);
  assert.match(component, /observer\?\.disconnect\(\)/);
  assert.match(component, /removeEventListener\("visibilitychange", update\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
