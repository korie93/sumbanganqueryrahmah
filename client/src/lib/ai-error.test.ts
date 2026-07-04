import assert from "node:assert/strict";
import test from "node:test";
import { resolveAiErrorMessage } from "@/lib/ai-error";

test("resolveAiErrorMessage preserves explicit backend messages", () => {
  assert.equal(
    resolveAiErrorMessage(new Error("AI queue busy (5/5). Please retry shortly.")),
    "AI queue busy (5/5). Please retry shortly.",
  );
});

test("resolveAiErrorMessage falls back to the stable generic message", () => {
  assert.equal(
    resolveAiErrorMessage(new Error("   ")),
    "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.",
  );
  assert.equal(
    resolveAiErrorMessage(null),
    "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.",
  );
});

test("resolveAiErrorMessage does not expose active HTML from backend errors", () => {
  const unsafeMessages = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)>",
    "javascript:alert(1)",
    '<div onclick="alert(1)">click</div>',
  ];

  for (const message of unsafeMessages) {
    const resolved = resolveAiErrorMessage(new Error(message));

    assert.equal(resolved, "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.");
    assert.doesNotMatch(resolved, /<script|<img|<svg|onclick=|onerror=|onload=|javascript:/i);
  }
});

test("resolveAiErrorMessage hides stack traces and local paths from leaked errors", () => {
  assert.equal(
    resolveAiErrorMessage(new Error("Error: failed\n    at run (C:\\app\\server\\ai.ts:10:2)")),
    "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.",
  );
  assert.equal(
    resolveAiErrorMessage({ message: "Cannot read /home/deploy/apps/sqr/.env" }),
    "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.",
  );
});

