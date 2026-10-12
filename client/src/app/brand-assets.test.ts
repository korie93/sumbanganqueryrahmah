import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { SQR_BRAND_ASSETS } from "@shared/brand-assets";

const asset = (url: string) => new URL(`../../public${url}`, import.meta.url);

test("approved brand SVGs are passive same-origin assets with original dimensions", () => {
    for (const url of Object.values(SQR_BRAND_ASSETS.full)) {
      const svg = readFileSync(asset(url), "utf8");
      assert.doesNotMatch(svg, /<script|<foreignObject|\bon\w+\s*=|<!DOCTYPE|<!ENTITY|(?:href|src)\s*=\s*["'](?:https?:|\/\/|javascript:)/i);
      assert.match(svg, /viewBox="425 38 665 310"/);
    }
});

test("favicon, touch and PWA declarations stay aligned with central brand paths", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  for (const url of [SQR_BRAND_ASSETS.favicon.svg, SQR_BRAND_ASSETS.favicon.ico, SQR_BRAND_ASSETS.appleTouchIcon]) {
    assert.ok(html.includes(`href="${url}"`));
    assert.ok(existsSync(asset(url)));
  }
  const manifest = JSON.parse(readFileSync(asset("/site.webmanifest"), "utf8"));
  assert.deepEqual(manifest.icons.map((icon: { src: string }) => icon.src), [SQR_BRAND_ASSETS.favicon.svg, SQR_BRAND_ASSETS.appIcon192, SQR_BRAND_ASSETS.appIcon512]);
  assert.equal(manifest.shortcuts[0].icons[0].src, SQR_BRAND_ASSETS.favicon.svg);
  // Supplied app icons are not certified maskable: do not claim the safe area.
  assert.ok(manifest.icons.every((icon: { purpose: string }) => icon.purpose === "any"));
  for (const [url, size] of [[SQR_BRAND_ASSETS.appleTouchIcon, 180], [SQR_BRAND_ASSETS.appIcon192, 192], [SQR_BRAND_ASSETS.appIcon512, 512]] as const) {
    const bytes = readFileSync(asset(url));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

test("supplied full SVG bytes have not been redrawn or recolored", () => {
  const approved = [
    [SQR_BRAND_ASSETS.full.light, "278eaec302fca73bbca56063b93db9062996262a3bc87b39d1fec6c2e6867b53"],
    [SQR_BRAND_ASSETS.full.dark, "5ded2453f5bcf5e960191384477dadf179ebec882c4c677b193ac37c5258c03c"],
  ] as const;
  for (const [url, sha256] of approved) assert.equal(createHash("sha256").update(readFileSync(asset(url))).digest("hex"), sha256, url);
});

test("new Q exports retain approved source provenance and bounded same-origin payloads", () => {
  const root = new URL("../../../", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("assets/brand/q-mark-exports.json", root), "utf8"));
  for (const entry of [...manifest.sources, ...manifest.files]) {
    const bytes = readFileSync(new URL(entry.file, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, entry.file);
  }
  for (const url of Object.values(SQR_BRAND_ASSETS.icon)) {
    const bytes = readFileSync(asset(url));
    assert.equal(bytes.readUInt32BE(16), 128);
    assert.equal(bytes.readUInt32BE(20), 128);
    assert.ok(bytes.length < 30_000, "Use icon-sized exports rather than loading the large source PNG");
  }
  for (const [url, mime] of [[SQR_BRAND_ASSETS.favicon.svg, "png"], [SQR_BRAND_ASSETS.statusIcon, "webp"]]) {
    const svg = readFileSync(asset(url!), "utf8");
    assert.doesNotMatch(svg, /<script|<foreignObject|\bon\w+\s*=|<!DOCTYPE|<!ENTITY/i);
    const links = [...svg.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
    assert.equal(links.length, 1);
    assert.match(links[0]!, new RegExp(`^data:image/${mime};base64,[A-Za-z0-9+/=]+$`));
  }
});
