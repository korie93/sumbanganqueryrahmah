import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const CLIENT_SOURCE_ROOT = path.resolve(process.cwd(), "client/src");
const SOURCE_FILE_EXTENSIONS = new Set([".ts", ".tsx"]);
const RAW_TAILWIND_Z_INDEX_PATTERN = /\bz-\[(?!var\()[^\]]+\]/g;

function collectSourceFiles(directoryPath) {
  const files = [];
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolutePath));
      continue;
    }

    if (!entry.isFile() || !SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    files.push(absolutePath);
  }
  return files;
}

function readThemeZIndexTokens() {
  const themePath = path.resolve(process.cwd(), "client/src/theme-tokens.css");
  const css = fs.readFileSync(themePath, "utf8");
  const tokens = new Map();

  for (const match of css.matchAll(/--(z-[a-z0-9-]+):\s*(-?\d+);/gi)) {
    tokens.set(match[1], Number(match[2]));
  }

  return tokens;
}

function requireToken(tokens, name) {
  const value = tokens.get(name);
  assert.equal(typeof value, "number", `Missing z-index token: --${name}`);
  return value;
}

test("design z-index tokens keep transient app shells below modal layers", () => {
  const tokens = readThemeZIndexTokens();
  const floatingAiRoot = requireToken(tokens, "z-floating-ai-root");
  const mobileNavOverlay = requireToken(tokens, "z-mobile-nav-overlay");
  const floatingAiOverlay = requireToken(tokens, "z-floating-ai-overlay");
  const mobileNavPanel = requireToken(tokens, "z-mobile-nav-panel");
  const modalOverlay = requireToken(tokens, "z-modal-overlay");
  const modalContent = requireToken(tokens, "z-modal-content");
  const popover = requireToken(tokens, "z-popover");
  const inlineOverlay = requireToken(tokens, "z-inline-overlay");

  assert.equal(inlineOverlay > 0, true);
  assert.equal(floatingAiRoot < mobileNavOverlay, true);
  assert.equal(mobileNavOverlay < floatingAiOverlay, true);
  assert.equal(floatingAiOverlay < mobileNavPanel, true);
  assert.equal(mobileNavPanel < modalOverlay, true);
  assert.equal(modalOverlay < modalContent, true);
  assert.equal(modalContent < popover, true);
});

test("client source uses z-index design tokens instead of raw numeric Tailwind utilities", () => {
  const failures = collectSourceFiles(CLIENT_SOURCE_ROOT).flatMap((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    const matches = [...source.matchAll(RAW_TAILWIND_Z_INDEX_PATTERN)].map((match) => match[0]);
    if (matches.length === 0) {
      return [];
    }

    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
    return [`${relativePath}: raw z-index utilities ${matches.join(", ")}`];
  });

  assert.deepEqual(failures, []);
});
