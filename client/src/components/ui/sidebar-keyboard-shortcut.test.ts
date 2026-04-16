import assert from "node:assert/strict";
import test from "node:test";
import { registerSidebarKeyboardShortcut } from "@/components/ui/sidebar-keyboard-shortcut";

test("sidebar keyboard shortcut only dispatches to the most recently registered listener", () => {
  const eventTarget = new EventTarget();
  const windowMock = Object.assign(globalThis, {
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowMock,
  });

  const calls: string[] = [];
  const unsubscribeFirst = registerSidebarKeyboardShortcut(() => {
    calls.push("first");
  });
  const unsubscribeSecond = registerSidebarKeyboardShortcut(() => {
    calls.push("second");
  });

  try {
    const firstEvent = new Event("keydown") as Event & { key: string; ctrlKey: boolean };
    firstEvent.key = "b";
    firstEvent.ctrlKey = true;
    window.dispatchEvent(firstEvent);
    assert.deepEqual(calls, ["second"]);

    unsubscribeSecond();
    const secondEvent = new Event("keydown") as Event & { key: string; ctrlKey: boolean };
    secondEvent.key = "b";
    secondEvent.ctrlKey = true;
    window.dispatchEvent(secondEvent);
    assert.deepEqual(calls, ["second", "first"]);
  } finally {
    unsubscribeFirst();
  }
});
