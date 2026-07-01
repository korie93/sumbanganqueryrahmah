import assert from "node:assert/strict";
import test from "node:test";

import {
  downloadBlob,
  getActiveDownloadObjectUrlCount,
  OBJECT_URL_REVOKE_DELAY_MS,
  revokeAllObjectUrls,
  sanitizeDownloadFilename,
} from "@/lib/download";

function withDownloadDom(
  callback: (state: {
    clicked: { value: boolean };
    clearTimeoutCalls: number[];
    createdUrls: string[];
    revokedUrls: string[];
    timeoutCallbacks: Map<number, TimerHandler>;
    timeoutDelays: number[];
  }) => void,
  options: {
    clickThrows?: boolean;
    removeThrows?: boolean;
    setTimeoutThrows?: boolean;
  } = {},
) {
  const globalObject = globalThis as typeof globalThis & {
    document?: Document;
    window?: Window & typeof globalThis;
  };
  const originalDocument = globalObject.document;
  const originalWindow = globalObject.window;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const clicked = { value: false };
  const clearTimeoutCalls: number[] = [];
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  const timeoutCallbacks = new Map<number, TimerHandler>();
  const timeoutDelays: number[] = [];
  let nextTimeoutId = 100;

  URL.createObjectURL = ((blob: Blob) => {
    const url = `blob:test-${createdUrls.length}-${blob.size}`;
    createdUrls.push(url);
    return url;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    revokedUrls.push(url);
  }) as typeof URL.revokeObjectURL;

  const anchor = {
    download: "",
    href: "",
    remove: () => {
      if (options.removeThrows) {
        throw new Error("synthetic remove failure");
      }
    },
    style: { display: "" },
    click: () => {
      clicked.value = true;
      if (options.clickThrows) {
        throw new Error("synthetic click failure");
      }
    },
  } as HTMLAnchorElement;

  globalObject.document = {
    body: {
      appendChild: () => anchor,
    },
    createElement: (tagName: string) => {
      if (tagName.toLowerCase() === "a") {
        return anchor;
      }
      throw new Error(`Unexpected element request: ${tagName}`);
    },
  } as unknown as Document;
  globalObject.window = {
    clearTimeout: ((timerId: number) => {
      clearTimeoutCalls.push(timerId);
      timeoutCallbacks.delete(timerId);
    }) as typeof window.clearTimeout,
    setTimeout: ((handler: TimerHandler, delay?: number) => {
      if (options.setTimeoutThrows) {
        throw new Error("synthetic timer failure");
      }
      const timeoutId = nextTimeoutId;
      nextTimeoutId += 1;
      timeoutCallbacks.set(timeoutId, handler);
      timeoutDelays.push(Number(delay));
      return timeoutId;
    }) as typeof window.setTimeout,
  } as Window & typeof globalThis;

  try {
    callback({
      clicked,
      clearTimeoutCalls,
      createdUrls,
      revokedUrls,
      timeoutCallbacks,
      timeoutDelays,
    });
  } finally {
    revokeAllObjectUrls();
    globalObject.document = originalDocument;
    globalObject.window = originalWindow;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
}

test("sanitizeDownloadFilename normalizes unsafe names", () => {
  assert.equal(sanitizeDownloadFilename("../report final\r\n.csv"), "_report_final_.csv");
  assert.equal(sanitizeDownloadFilename("..\\..\\.env"), "_._.env");
  assert.equal(sanitizeDownloadFilename("..."), "download");
  assert.equal(sanitizeDownloadFilename(""), "download");
  assert.equal(sanitizeDownloadFilename("a".repeat(300)).length, 255);
});

test("downloadBlob delays object URL revocation and returns lifecycle cleanup", () => {
  withDownloadDom((state) => {
    const cleanup = downloadBlob(new Blob(["alpha"]), "../Audit Report\r\n.csv");

    assert.equal(state.clicked.value, true);
    assert.equal(state.createdUrls.length, 1);
    assert.equal(state.timeoutDelays[0], OBJECT_URL_REVOKE_DELAY_MS);
    assert.deepEqual(state.revokedUrls, []);
    assert.equal(getActiveDownloadObjectUrlCount(), 1);

    cleanup();

    assert.deepEqual(state.revokedUrls, ["blob:test-0-5"]);
    assert.deepEqual(state.clearTimeoutCalls, [100]);
    assert.equal(getActiveDownloadObjectUrlCount(), 0);
  });
});

test("downloadBlob scheduled cleanup revokes an object URL once", () => {
  withDownloadDom((state) => {
    const cleanup = downloadBlob(new Blob(["beta"]), "safe.csv");
    const scheduled = state.timeoutCallbacks.get(100);
    if (typeof scheduled !== "function") {
      throw new Error("Expected scheduled object URL cleanup callback");
    }

    scheduled();
    cleanup();

    assert.deepEqual(state.revokedUrls, ["blob:test-0-4"]);
    assert.equal(getActiveDownloadObjectUrlCount(), 0);
  });
});

test("downloadBlob revokes object URL immediately when the download click fails", () => {
  withDownloadDom((state) => {
    assert.throws(
      () => downloadBlob(new Blob(["click"]), "safe.csv"),
      /synthetic click failure/,
    );

    assert.equal(state.clicked.value, true);
    assert.deepEqual(state.revokedUrls, ["blob:test-0-5"]);
    assert.equal(getActiveDownloadObjectUrlCount(), 0);
    assert.equal(state.timeoutCallbacks.size, 0);
  }, { clickThrows: true });
});

test("downloadBlob revokes object URL immediately when link removal fails", () => {
  withDownloadDom((state) => {
    assert.throws(
      () => downloadBlob(new Blob(["remove"]), "safe.csv"),
      /synthetic remove failure/,
    );

    assert.equal(state.clicked.value, true);
    assert.deepEqual(state.revokedUrls, ["blob:test-0-6"]);
    assert.equal(getActiveDownloadObjectUrlCount(), 0);
    assert.equal(state.timeoutCallbacks.size, 0);
  }, { removeThrows: true });
});

test("downloadBlob revokes object URL immediately when cleanup scheduling fails", () => {
  withDownloadDom((state) => {
    assert.throws(
      () => downloadBlob(new Blob(["timer"]), "safe.csv"),
      /synthetic timer failure/,
    );

    assert.equal(state.clicked.value, true);
    assert.deepEqual(state.revokedUrls, ["blob:test-0-5"]);
    assert.equal(getActiveDownloadObjectUrlCount(), 0);
    assert.equal(state.timeoutCallbacks.size, 0);
  }, { setTimeoutThrows: true });
});

test("revokeAllObjectUrls clears all pending download URLs", () => {
  withDownloadDom((state) => {
    downloadBlob(new Blob(["one"]), "one.csv");
    downloadBlob(new Blob(["two"]), "two.csv");

    assert.equal(getActiveDownloadObjectUrlCount(), 2);
    revokeAllObjectUrls();

    assert.deepEqual(state.revokedUrls, ["blob:test-0-3", "blob:test-1-3"]);
    assert.deepEqual(state.clearTimeoutCalls, [100, 101]);
    assert.equal(getActiveDownloadObjectUrlCount(), 0);
  });
});
