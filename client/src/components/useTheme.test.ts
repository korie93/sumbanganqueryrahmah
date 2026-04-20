import assert from "node:assert/strict";
import test from "node:test";
import { bindThemeMediaChangeListener } from "@/components/useTheme";

test("bindThemeMediaChangeListener prefers modern media-query listeners when available", () => {
  const calls: string[] = [];
  const mediaQueryList = {
    addEventListener: (_eventName: string, _listener: (event: MediaQueryListEvent) => void) => {
      calls.push("addEventListener");
    },
    removeEventListener: (_eventName: string, _listener: (event: MediaQueryListEvent) => void) => {
      calls.push("removeEventListener");
    },
  } as unknown as MediaQueryList;

  const cleanup = bindThemeMediaChangeListener(mediaQueryList, () => undefined);
  cleanup();

  assert.deepEqual(calls, ["addEventListener", "removeEventListener"]);
});

test("bindThemeMediaChangeListener falls back to legacy media-query listeners when needed", () => {
  const calls: string[] = [];
  const mediaQueryList = {
    addListener: (_listener: (event: MediaQueryListEvent) => void) => {
      calls.push("addListener");
    },
    removeListener: (_listener: (event: MediaQueryListEvent) => void) => {
      calls.push("removeListener");
    },
  } as unknown as MediaQueryList;

  const cleanup = bindThemeMediaChangeListener(mediaQueryList, () => undefined);
  cleanup();

  assert.deepEqual(calls, ["addListener", "removeListener"]);
});
