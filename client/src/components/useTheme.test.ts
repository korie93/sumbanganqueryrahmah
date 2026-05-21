import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTheme,
  resolveInitialTheme,
  subscribeSystemThemeChange,
} from "./useTheme";
import type { BrowserStorageLike } from "@/lib/browser-storage";

function createStorageMock(options: { throwOnGet?: boolean; throwOnSet?: boolean } = {}): BrowserStorageLike {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    getItem(key: string) {
      if (options.throwOnGet) {
        throw new Error("storage denied");
      }
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (options.throwOnSet) {
        throw new Error("storage denied");
      }
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
  };
}

function installThemeDom(storage: BrowserStorageLike | null, prefersDark = false) {
  const classNames = new Set<string>();
  const root = {
    classList: {
      add(value: string) {
        classNames.add(value);
      },
      contains(value: string) {
        return classNames.has(value);
      },
      remove(value: string) {
        classNames.delete(value);
      },
    },
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
  };
  const events: string[] = [];
  const windowMock = {
    dispatchEvent(event: Event) {
      events.push(event.type);
      return true;
    },
    matchMedia() {
      return {
        matches: prefersDark,
      };
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowMock,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: root,
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });

  return { events, root };
}

test("theme helpers tolerate unavailable storage and keep system fallback stable", () => {
  installThemeDom(createStorageMock({ throwOnGet: true }), true);

  assert.equal(resolveInitialTheme(), "dark");
});

test("applyTheme updates the document without throwing when storage writes fail", () => {
  const { events, root } = installThemeDom(createStorageMock({ throwOnSet: true }));

  assert.doesNotThrow(() => applyTheme("dark"));
  assert.equal(root.classList.contains("dark"), true);
  assert.equal(root.dataset.theme, "dark");
  assert.equal(root.style.colorScheme, "dark");
  assert.deepEqual(events, ["app-theme-change"]);
});

test("subscribeSystemThemeChange prefers modern MediaQueryList listeners", () => {
  const calls: string[] = [];
  const listener = () => undefined;
  const media = {
    addEventListener(event: string, handler: () => void) {
      calls.push(`addEventListener:${event}:${handler === listener}`);
    },
    removeEventListener(event: string, handler: () => void) {
      calls.push(`removeEventListener:${event}:${handler === listener}`);
    },
    addListener() {
      calls.push("addListener");
    },
    removeListener() {
      calls.push("removeListener");
    },
  } as unknown as MediaQueryList;

  const unsubscribe = subscribeSystemThemeChange(media, listener);
  unsubscribe();

  assert.deepEqual(calls, [
    "addEventListener:change:true",
    "removeEventListener:change:true",
  ]);
});

test("subscribeSystemThemeChange keeps legacy MediaQueryList fallback isolated", () => {
  const calls: string[] = [];
  const listener = () => undefined;
  const media = {
    addListener(handler: () => void) {
      calls.push(`addListener:${handler === listener}`);
    },
    removeListener(handler: () => void) {
      calls.push(`removeListener:${handler === listener}`);
    },
  } as unknown as MediaQueryList;

  const unsubscribe = subscribeSystemThemeChange(media, listener);
  unsubscribe();

  assert.deepEqual(calls, [
    "addListener:true",
    "removeListener:true",
  ]);
});
