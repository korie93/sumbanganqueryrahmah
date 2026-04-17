import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Input } from "@/components/ui/input";

function installDomGlobals(dom: JSDOM) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNavigator = globalThis.navigator;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousHTMLInputElement = globalThis.HTMLInputElement;
  const previousNode = globalThis.Node;

  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    HTMLInputElement: { configurable: true, value: dom.window.HTMLInputElement },
    Node: { configurable: true, value: dom.window.Node },
  });

  return () => {
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: previousWindow },
      document: { configurable: true, value: previousDocument },
      navigator: { configurable: true, value: previousNavigator },
      HTMLElement: { configurable: true, value: previousHTMLElement },
      HTMLInputElement: { configurable: true, value: previousHTMLInputElement },
      Node: { configurable: true, value: previousNode },
    });
    dom.window.close();
  };
}

async function flushReactEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("Input warns in development when it renders without an accessible name", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/",
  });
  const restoreDom = installDomGlobals(dom);
  const warningCalls: Array<{ message: string; metadata: Record<string, unknown> | undefined }> = [];
  const warnMock = t.mock.method(console, "warn", (message?: unknown, metadata?: unknown) => {
    warningCalls.push({
      message: String(message || ""),
      metadata: (metadata && typeof metadata === "object") ? metadata as Record<string, unknown> : undefined,
    });
  });

  try {
    const rootElement = document.getElementById("root");
    assert.ok(rootElement);
    const root = createRoot(rootElement);

    flushSync(() => {
      root.render(createElement(Input, { type: "text" }));
    });
    await flushReactEffects();
    flushSync(() => {
      root.unmount();
    });
    await flushReactEffects();

    assert.equal(warnMock.mock.callCount(), 1);
    assert.match(warningCalls[0]?.message || "", /without an accessible name/i);
    assert.equal(warningCalls[0]?.metadata?.type, "text");
  } finally {
    restoreDom();
  }
});

test("Input does not warn when a visible label is associated through htmlFor", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/",
  });
  const restoreDom = installDomGlobals(dom);
  const warnMock = t.mock.method(console, "warn", () => undefined);

  try {
    const rootElement = document.getElementById("root");
    assert.ok(rootElement);
    const root = createRoot(rootElement);

    flushSync(() => {
      root.render(createElement("div", null, [
        createElement("label", { key: "label", htmlFor: "email-field" }, "Email"),
        createElement(Input, { key: "input", id: "email-field", type: "email" }),
      ]));
    });
    await flushReactEffects();
    flushSync(() => {
      root.unmount();
    });
    await flushReactEffects();

    assert.equal(warnMock.mock.callCount(), 0);
  } finally {
    restoreDom();
  }
});
