import assert from "node:assert/strict";
import test from "node:test";
import { resolveFloatingAIMinimizedStatus } from "./floating-ai-status";

test("resolveFloatingAIMinimizedStatus maps AI popup states to stable compact labels", () => {
  assert.equal(resolveFloatingAIMinimizedStatus("SEARCHING"), "AI sedang mencari maklumat...");
  assert.equal(resolveFloatingAIMinimizedStatus("PROCESSING"), "AI sedang memproses data...");
  assert.equal(resolveFloatingAIMinimizedStatus("TYPING"), "AI sedang menaip jawapan...");
  assert.equal(resolveFloatingAIMinimizedStatus("IDLE"), "AI sedang memproses...");
});
