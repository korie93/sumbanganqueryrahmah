import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { resolveAppRoot } from "@/bootstrap-root";

test("resolveAppRoot returns the root element when it exists", () => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>");

  try {
    const root = resolveAppRoot(dom.window.document);
    assert.equal(root.id, "root");
  } finally {
    dom.window.close();
  }
});

test("resolveAppRoot throws a clear startup error when the root element is missing", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");

  try {
    assert.throws(
      () => resolveAppRoot(dom.window.document),
      /root element "#root" is missing/i,
    );
  } finally {
    dom.window.close();
  }
});
