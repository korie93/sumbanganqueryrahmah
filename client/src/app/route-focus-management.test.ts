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
  const scheduledCallbacks: FrameRequestCallback[] = [];
  const cancelledHandles: number[] = [];

  const cancel = scheduleMainContentFocus(
    {
      requestAnimationFrame(callback: FrameRequestCallback) {
        scheduledCallbacks.push(callback);
        return 77 + scheduledCallbacks.length - 1;
      },
      cancelAnimationFrame(handle: number) {
        cancelledHandles.push(handle);
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

  scheduledCallbacks[0]?.(0);
  scheduledCallbacks[1]?.(16);
  cancel();

  assert.deepEqual(focusCalls, [{ preventScroll: true }]);
  assert.deepEqual(cancelledHandles, [77, 78]);
});

test("scheduleMainContentFocus can be cancelled before the nested frame runs", () => {
  const focusCalls: Array<{ preventScroll?: boolean } | undefined> = [];
  const scheduledCallbacks: FrameRequestCallback[] = [];
  const cancelledHandles: number[] = [];

  const cancel = scheduleMainContentFocus(
    {
      requestAnimationFrame(callback: FrameRequestCallback) {
        scheduledCallbacks.push(callback);
        return 91 + scheduledCallbacks.length - 1;
      },
      cancelAnimationFrame(handle: number) {
        cancelledHandles.push(handle);
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

  scheduledCallbacks[0]?.(0);
  cancel();

  assert.deepEqual(focusCalls, []);
  assert.deepEqual(cancelledHandles, [91, 92]);
});
