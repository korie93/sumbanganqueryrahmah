import assert from "node:assert/strict";
import test from "node:test";
import { focusMainContent, scheduleMainContentFocus } from "@/app/route-focus-management";

test("focusMainContent focuses the main landmark with preventScroll when available", () => {
  const focusCalls: Array<{ preventScroll?: boolean } | undefined> = [];
  const focused = focusMainContent({
    getElementById(id: string) {
      if (id !== "main-content") {
        return null;
      }

      return {
        focus(options?: { preventScroll?: boolean }) {
          focusCalls.push(options);
        },
      };
    },
  });

  assert.equal(focused, true);
  assert.deepEqual(focusCalls, [{ preventScroll: true }]);
});

test("focusMainContent falls back to a plain focus call when preventScroll is unsupported", () => {
  const focusCalls: Array<{ preventScroll?: boolean } | undefined> = [];
  let attempt = 0;

  const focused = focusMainContent({
    getElementById() {
      return {
        focus(options?: { preventScroll?: boolean }) {
          attempt += 1;
          if (attempt === 1) {
            throw new Error("preventScroll unsupported");
          }
          focusCalls.push(options);
        },
      };
    },
  });

  assert.equal(focused, true);
  assert.deepEqual(focusCalls, [undefined]);
});

test("scheduleMainContentFocus uses requestAnimationFrame and supports cancellation", () => {
  const focusCalls: Array<{ preventScroll?: boolean } | undefined> = [];
  let scheduledCallback: FrameRequestCallback | null = null;
  let cancelledHandle: number | null = null;

  const cancel = scheduleMainContentFocus(
    {
      requestAnimationFrame(callback: FrameRequestCallback) {
        scheduledCallback = callback;
        return 77;
      },
      cancelAnimationFrame(handle: number) {
        cancelledHandle = handle;
      },
    },
    {
      getElementById() {
        return {
          focus(options?: { preventScroll?: boolean }) {
            focusCalls.push(options);
          },
        };
      },
    },
  );

  const callback = scheduledCallback as ((timestamp: number) => void) | null;
  if (callback !== null) {
    callback(0);
  }
  cancel();

  assert.deepEqual(focusCalls, [{ preventScroll: true }]);
  assert.equal(cancelledHandle, 77);
});
