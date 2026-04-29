import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientSrcDir = path.resolve(__dirname, "..");

function readComponentSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

function readClientSource(relativePath: string) {
  return readFileSync(path.resolve(clientSrcDir, relativePath), "utf8");
}

test("floating AI chat input has a formal accessible label", () => {
  const source = readComponentSource("AIChat.tsx");

  assert.match(source, /<label htmlFor=\{queryInputId\} className="sr-only">/);
  assert.match(source, /Taip soalan kepada AI SQR/);
  assert.match(source, /data-floating-ai-query-input="true"/);
  assert.match(source, /aria-label="Hantar soalan AI"/);
  assert.match(source, /<span>Hentikan AI<\/span>/);
  assert.match(source, /Pembantu AI dinyahaktifkan oleh tetapan sistem\./);
  assert.doesNotMatch(source, /aria-label="Send AI query"/);
  assert.doesNotMatch(source, />Stop AI</);
});

test("floating AI dialog exposes boolean disclosure state and semantic heading", () => {
  const source = readComponentSource("FloatingAI.tsx");

  assert.match(source, /"aria-expanded": isOpen/);
  assert.doesNotMatch(source, /"aria-expanded": isOpen \? "true" : "false"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-labelledby=\{panelTitleId\}/);
  assert.match(source, /<h2\s+id=\{panelTitleId\}/);
  assert.match(source, /aria-label="Tutup panel AI"/);
  assert.match(source, /aria-label="Kecilkan panel AI"/);
  assert.match(source, /aria-label=\{isOpen \? "Kecilkan panel AI SQR" : "Buka panel AI SQR"\}/);
  assert.doesNotMatch(source, /Close AI panel/);
  assert.doesNotMatch(source, /Minimize AI panel/);
  assert.doesNotMatch(source, /Open AI SQR panel/);
});

test("floating AI desktop focus handoff is bounded and panel transition is property-specific", () => {
  const source = readComponentSource("FloatingAI.tsx");

  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /cancelAnimationFrame/);
  assert.match(source, /triggerButtonRef\.current\?\.focus\(\)/);
  assert.match(source, /transition-\[opacity,transform\]/);
  assert.doesNotMatch(source, /floatingPanelShell,[\s\S]*transition-all/);
});

test("floating AI motion and scroll styles include accessibility fallbacks", () => {
  const aiCss = readClientSource("styles/ai.css");
  const floatingCss = readComponentSource("FloatingAI.module.css");

  assert.match(aiCss, /\.ai-messages::-webkit-scrollbar-thumb[\s\S]*background:\s*var\(--ai-scroll-thumb\)/);
  assert.doesNotMatch(aiCss, /scrollbar-color:/);
  assert.doesNotMatch(aiCss, /scrollbar-gutter:/);
  assert.doesNotMatch(aiCss, /scrollbar-width:/);
  assert.match(aiCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(floatingCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(floatingCss, /\.aiThinkingRing::after[\s\S]*animation:\s*none/);
});

test("viewport fallback only reaches 100vh when dvh and svh are unsupported", () => {
  const tokens = readClientSource("theme-tokens.css");

  assert.match(tokens, /@supports not \(height: 100dvh\) \{/);
  assert.match(tokens, /@supports not \(height: 100dvh\) and not \(height: 100svh\) \{/);
});
