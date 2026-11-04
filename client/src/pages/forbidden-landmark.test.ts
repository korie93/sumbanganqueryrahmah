import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
await import(new URL("../../../scripts/lib/register-client-css-test-loader.mjs", import.meta.url).href);
const { default: Forbidden } = await import("./Forbidden");

test("standalone Forbidden retains its focusable main landmark and recovery actions", () => {
  const html = renderToStaticMarkup(createElement(Router, { ssrPath: "/403", children: createElement(Forbidden) }));
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.equal((html.match(/id="main-content"/g) ?? []).length, 1);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /Ke Halaman Utama/);
});

test("embedded Forbidden uses the shell landmark without adding a second main or duplicate ID", () => {
  const html = renderToStaticMarkup(createElement(Router, {
    ssrPath: "/saved",
    children: createElement("main", { id: "main-content" }, createElement(Forbidden, { embedded: true })),
  }));
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.equal((html.match(/id="main-content"/g) ?? []).length, 1);
  assert.match(html, /403 Forbidden/);
  assert.match(html, /Ke Halaman Utama/);
});
