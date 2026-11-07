import assert from "node:assert/strict";
import test from "node:test";
import { getAutoGrowTextareaSize } from "./auto-grow-textarea";

const full = { lineHeight: 24, padding: 16, border: 2, boxSizing: "border-box" as const, minHeight: 64 };

test("two-row composer grows with wrapped input, then returns to minimum when cleared", () => {
  assert.deepEqual(getAutoGrowTextareaSize({ ...full, scrollHeight: 64 }), { height: 66, overflowY: "hidden" });
  assert.deepEqual(getAutoGrowTextareaSize({ ...full, scrollHeight: 112 }), { height: 114, overflowY: "hidden" });
  assert.deepEqual(getAutoGrowTextareaSize({ ...full, scrollHeight: 16 }), { height: 66, overflowY: "hidden" });
});

test("long pasted input caps at five rows and enables scrolling rather than extending the chat", () => {
  assert.deepEqual(getAutoGrowTextareaSize({ ...full, scrollHeight: 1600 }), { height: 138, overflowY: "auto" });
  assert.deepEqual(getAutoGrowTextareaSize({ ...full, scrollHeight: 136 }), { height: 138, overflowY: "hidden" });
});

test("compact composer starts at one row and includes its own padding and border", () => {
  const compact = { ...full, padding: 20, minHeight: 44 };
  assert.deepEqual(getAutoGrowTextareaSize({ ...compact, scrollHeight: 44 }, { minRows: 1 }), { height: 46, overflowY: "hidden" });
  assert.deepEqual(getAutoGrowTextareaSize({ ...compact, scrollHeight: 1600 }, { minRows: 1 }), { height: 142, overflowY: "auto" });
});

test("viewport CSS max-height remains authoritative even below preferred row minimum", () => {
  assert.deepEqual(getAutoGrowTextareaSize({ ...full, scrollHeight: 1600, maxHeight: 100 }), { height: 100, overflowY: "auto" });
  assert.deepEqual(getAutoGrowTextareaSize({ ...full, minHeight: 44, maxHeight: 52, scrollHeight: 64 }), { height: 52, overflowY: "auto" });
});

test("CSS min-height takes precedence over conflicting row or viewport caps", () => {
  assert.deepEqual(getAutoGrowTextareaSize({ ...full, minHeight: 80, maxHeight: 50, scrollHeight: 78 }), { height: 80, overflowY: "hidden" });
});

test("content-box sizing subtracts padding and borders exactly once", () => {
  const contentBox = { ...full, boxSizing: "content-box" as const, minHeight: 0 };
  assert.deepEqual(getAutoGrowTextareaSize({ ...contentBox, scrollHeight: 16 }), { height: 48, overflowY: "hidden" });
  assert.deepEqual(getAutoGrowTextareaSize({ ...contentBox, scrollHeight: 1600 }), { height: 120, overflowY: "auto" });
  assert.deepEqual(getAutoGrowTextareaSize({ ...contentBox, maxHeight: 72, scrollHeight: 1600 }), { height: 72, overflowY: "auto" });
});

test("large text uses actual line height and invalid metrics cannot produce NaN styles", () => {
  assert.deepEqual(getAutoGrowTextareaSize({ ...full, lineHeight: 30, scrollHeight: 1000 }), { height: 168, overflowY: "auto" });
  assert.deepEqual(getAutoGrowTextareaSize({ ...full, lineHeight: NaN, scrollHeight: NaN }, { minRows: NaN, maxRows: -1 }), { height: 66, overflowY: "hidden" });
});
