import assert from "node:assert/strict";
import test from "node:test";
import { handleAIQueryKeyDown } from "@/components/ai-query-keyboard";

const base = { key: "Enter", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, nativeEvent: { isComposing: false } };
for (const modifier of ["ctrlKey", "metaKey"] as const) {
  test(`${modifier}+Enter sends once only when enabled`, () => {
    let sent = 0, prevented = 0;
    const event = { ...base, [modifier]: true, preventDefault: () => { prevented += 1; } };
    handleAIQueryKeyDown(event, true, () => { sent += 1; });
    handleAIQueryKeyDown(event, false, () => { sent += 1; });
    assert.equal(sent, 1);
    assert.equal(prevented, 2);
  });
}
for (const [label, override] of [
  ["normal Enter", {}], ["another key", { key: "a", ctrlKey: true }],
  ["Shift", { ctrlKey: true, shiftKey: true }], ["Alt", { metaKey: true, altKey: true }],
  ["repeat", { ctrlKey: true, repeat: true }],
  ["IME composing", { ctrlKey: true, nativeEvent: { isComposing: true } }],
  ["legacy IME", { ctrlKey: true, nativeEvent: { isComposing: false, keyCode: 229 } }],
] as const) {
  test(`${label} keeps native typing`, () => {
    handleAIQueryKeyDown({ ...base, ...override, preventDefault: () => assert.fail("Native key was intercepted") }, true,
      () => assert.fail("Native key sent a request"));
  });
}
