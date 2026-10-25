import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Select from "@radix-ui/react-select";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import {
  extractRadixViewportStyleHashes,
  generateRadixViewportStyleHashes,
} from "../lib/radix-viewport-csp-hashes.mjs";

const securitySource = readFileSync(path.join(process.cwd(), "server/internal/local-http-security.ts"), "utf8");

test("Radix viewport hashes match the actual reviewed Select and ScrollArea dependency CSS", () => {
  const { hashes, styles } = generateRadixViewportStyleHashes();
  assert.deepEqual(hashes, [
    "'sha256-441zG27rExd4/il+NvIqyL8zFx5XmyNQtE381kSkUJk='",
    "'sha256-vGQdhYJbTuF+M8iCn1IZCHpdkiICocWHDq4qnQF4Rjw='",
  ]);
  assert.deepEqual(extractRadixViewportStyleHashes(securitySource), hashes);
  assert.deepEqual(styles.map((style) => Buffer.byteLength(style.css)), [169, 179]);
});

test("actual Radix components emit the exact viewport styles approved by production CSP", () => {
  const { styles } = generateRadixViewportStyleHashes();
  const fixtures = [
    React.createElement(Select.Root, { open: true },
      React.createElement(Select.Content, {},
        React.createElement(Select.Viewport, {}, "Synthetic options"))),
    React.createElement(ScrollArea.Root, {},
      React.createElement(ScrollArea.Viewport, {}, "Synthetic content")),
  ];
  const approved = extractRadixViewportStyleHashes(securitySource);
  fixtures.forEach((fixture, index) => {
    const html = renderToStaticMarkup(fixture);
    const emittedStyles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
      .map((match) => match[1]);
    assert.ok(emittedStyles.includes(styles[index].css), "Verify emitted bytes, not just source metadata");
    for (const css of emittedStyles) {
      const hash = `'sha256-${createHash("sha256").update(css).digest("base64")}'`;
      assert.ok(approved.includes(hash), "Every emitted viewport style must match an exact approved hash");
    }
  });
});

test("viewport approvals keep arbitrary styles and unsafe inline directives blocked", () => {
  const unknownCssHash = `'sha256-${createHash("sha256").update("body{display:none}").digest("base64")}'`;
  const allApprovedHashes = [...securitySource.matchAll(/'sha256-[A-Za-z0-9+/]{43}='/g)]
    .map((match) => match[0]);
  assert.equal(allApprovedHashes.includes(unknownCssHash), false);
  assert.match(securitySource, /styleSrcElem:\s*\["'self'",\s*\.\.\.REACT_REMOVE_SCROLL_BAR_STYLE_HASHES,\s*\.\.\.RADIX_VIEWPORT_STYLE_HASHES\]/);
  assert.doesNotMatch(securitySource, /\b(?:scriptSrc|scriptSrcAttr|styleSrc|styleSrcElem|styleSrcAttr):\s*\[[^\]]*unsafe-inline/);
  assert.match(securitySource, /styleSrcAttr:\s*\["'none'"\]/);
  assert.match(securitySource, /scriptSrc:\s*\["'self'"\]/);
});

test("viewport allowlist parsing fails closed on missing, ambiguous or non-hash entries", () => {
  assert.throws(() => extractRadixViewportStyleHashes(""), /Expected one/);
  assert.throws(() => extractRadixViewportStyleHashes(`${securitySource}\n${securitySource}`), /Expected one/);
  const unreviewedEntry = securitySource.replace(
    "'sha256-441zG27rExd4/il+NvIqyL8zFx5XmyNQtE381kSkUJk='",
    "'unsafe-inline'",
  );
  assert.throws(() => extractRadixViewportStyleHashes(unreviewedEntry), /exactly two reviewed/);
});
