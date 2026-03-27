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

