import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveIsMobileViewport, useIsMobile } from "@/hooks/use-mobile";

type WindowDescriptor = PropertyDescriptor | undefined;

function withWindow(windowValue: Window, run: () => void) {
  const originalWindowDescriptor: WindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowValue,
  });

  try {
    run();
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

function createWindowDouble(params: { innerWidth: number; matches: boolean }): Window {
  return {
    innerWidth: params.innerWidth,
    matchMedia: () => ({
      matches: params.matches,
      addEventListener() {
        return undefined;
      },
      removeEventListener() {
        return undefined;
      },
    }),
  } as unknown as Window;
}

test("resolveIsMobileViewport falls back safely when window is unavailable", () => {
  assert.equal(resolveIsMobileViewport(undefined), false);
});

test("resolveIsMobileViewport prefers the current media query match when available", () => {
  assert.equal(resolveIsMobileViewport(createWindowDouble({ innerWidth: 1024, matches: true })), true);
  assert.equal(resolveIsMobileViewport(createWindowDouble({ innerWidth: 375, matches: false })), false);
});

test("useIsMobile uses the current viewport on the first render without waiting for an effect", () => {
  function Consumer() {
    return createElement("span", null, useIsMobile() ? "mobile" : "desktop");
  }

  withWindow(createWindowDouble({ innerWidth: 375, matches: true }), () => {
    const markup = renderToStaticMarkup(createElement(Consumer));
    assert.match(markup, /mobile/);
  });
});
