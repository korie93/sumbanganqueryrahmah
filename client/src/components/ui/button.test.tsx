import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";

function installDomGlobals(dom: JSDOM) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNavigator = globalThis.navigator;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousHTMLButtonElement = globalThis.HTMLButtonElement;
  const previousNode = globalThis.Node;

  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    HTMLButtonElement: { configurable: true, value: dom.window.HTMLButtonElement },
    Node: { configurable: true, value: dom.window.Node },
  });

  return () => {
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: previousWindow },
      document: { configurable: true, value: previousDocument },
      navigator: { configurable: true, value: previousNavigator },
      HTMLElement: { configurable: true, value: previousHTMLElement },
      HTMLButtonElement: { configurable: true, value: previousHTMLButtonElement },
      Node: { configurable: true, value: previousNode },
    });
    dom.window.close();
  };
}

async function flushReactEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("Button warns in development when an icon-only button has no accessible name", async (t) => {
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
      root.render(createElement(
        Button,
        { size: "icon", variant: "ghost" },
        createElement("svg", { "aria-hidden": "true" }),
      ));
    });
    await flushReactEffects();
    flushSync(() => {
      root.unmount();
    });
    await flushReactEffects();

    assert.equal(warnMock.mock.callCount(), 1);
    assert.match(warningCalls[0]?.message || "", /without an accessible name/i);
    assert.equal(warningCalls[0]?.metadata?.variant, "ghost");
  } finally {
    restoreDom();
  }
});

test("Button does not warn when an icon-only button receives a title-backed accessible name", async (t) => {
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
      root.render(createElement(
        Button,
        { size: "icon", title: "Close drawer", variant: "ghost" },
        createElement("svg", { "aria-hidden": "true" }),
      ));
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
