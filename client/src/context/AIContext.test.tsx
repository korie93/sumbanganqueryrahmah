import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  AIProvider,
  useAIContext,
  type AIContextValue,
} from "@/context/AIContext";

type WindowGlobals = Pick<typeof globalThis, "window" | "document" | "navigator" | "HTMLElement" | "Node">;

function installDomGlobals(dom: JSDOM) {
  const previousGlobals: Partial<WindowGlobals> = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
  };

  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    Node: { configurable: true, value: dom.window.Node },
  });

  return () => {
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: previousGlobals.window },
      document: { configurable: true, value: previousGlobals.document },
      navigator: { configurable: true, value: previousGlobals.navigator },
      HTMLElement: { configurable: true, value: previousGlobals.HTMLElement },
      Node: { configurable: true, value: previousGlobals.Node },
    });
    dom.window.close();
  };
}

async function flushReactEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("AIProvider keeps resetSession stable across rerenders and clears session state", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/",
  });
  const restoreDom = installDomGlobals(dom);
  let latestContext: AIContextValue | null = null;

  function ContextProbe() {
    latestContext = useAIContext();
    return null;
  }

  function readLatestContext() {
    assert.ok(latestContext);
    return latestContext;
  }

  try {
    const rootElement = document.getElementById("root");
    assert.ok(rootElement);
    const root = createRoot(rootElement);

    flushSync(() => {
      root.render(createElement(AIProvider, null, createElement(ContextProbe)));
    });
    await flushReactEffects();

    const firstResetSession = readLatestContext().resetSession;

    flushSync(() => {
      readLatestContext().setMessages([{
        id: "message-1",
        role: "user",
        content: "Hello",
        timestamp: "2026-04-20T10:00:00.000Z",
      }]);
      readLatestContext().setUnreadCount(3);
    });
    await flushReactEffects();

    assert.equal(readLatestContext().resetSession, firstResetSession);
    assert.equal(readLatestContext().messages.length, 1);
    assert.equal(readLatestContext().unreadCount, 3);

    flushSync(() => {
      readLatestContext().resetSession();
    });
    await flushReactEffects();

    assert.equal(readLatestContext().messages.length, 0);
    assert.equal(readLatestContext().unreadCount, 0);

    flushSync(() => {
      root.unmount();
    });
    await flushReactEffects();
  } finally {
    restoreDom();
  }
});
