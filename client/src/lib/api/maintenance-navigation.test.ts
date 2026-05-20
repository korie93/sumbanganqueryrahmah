import assert from "node:assert/strict";
import test from "node:test";
import { notifyMaintenanceMode } from "./maintenance-navigation";

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
  } as Storage;
}

function withMockBrowser(callback: (state: {
  events: Event[];
  replacedUrls: string[];
  storage: Storage;
}) => void) {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalCustomEvent = globalThis.CustomEvent;
  const storage = createStorageMock();
  const events: Event[] = [];
  const replacedUrls: string[] = [];

  class TestCustomEvent<T = unknown> extends Event {
    detail: T;

    constructor(type: string, init?: CustomEventInit<T>) {
      super(type);
      this.detail = init?.detail as T;
    }
  }

  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: TestCustomEvent,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      dispatchEvent(event: Event) {
        events.push(event);
        return true;
      },
      history: {
        replaceState(_state: unknown, _title: string, url?: string | URL | null) {
          replacedUrls.push(String(url));
        },
      },
      location: {
        pathname: "/collection/save",
        search: "",
      },
    } as unknown as Window & typeof globalThis,
  });

  try {
    callback({ events, replacedUrls, storage });
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
    Object.defineProperty(globalThis, "CustomEvent", {
      configurable: true,
      value: originalCustomEvent,
    });
  }
}

test("notifyMaintenanceMode redirects hard maintenance to the maintenance page", () => {
  withMockBrowser(({ events, replacedUrls, storage }) => {
    notifyMaintenanceMode({ maintenance: true, type: "hard", message: "Hard maintenance" });

    assert.equal(replacedUrls[0], "/maintenance");
    assert.equal(events[0]?.type, "maintenance-updated");
    assert.equal(JSON.parse(String(storage.getItem("maintenanceState"))).type, "hard");
  });
});

test("notifyMaintenanceMode keeps soft maintenance inside the authenticated app", () => {
  withMockBrowser(({ events, replacedUrls, storage }) => {
    notifyMaintenanceMode({ maintenance: true, type: "soft", message: "Soft maintenance" });

    assert.equal(replacedUrls.length, 0);
    assert.equal(events[0]?.type, "maintenance-updated");
    assert.equal(JSON.parse(String(storage.getItem("maintenanceState"))).type, "soft");
  });
});
