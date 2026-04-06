import assert from "node:assert/strict";
import test from "node:test";
import { resolveFloatingAiHasDensePage } from "@/components/floating-ai-dom-utils";

test("resolveFloatingAiHasDensePage detects dense operational routes", () => {
  assert.equal(resolveFloatingAiHasDensePage("monitor", "/monitor"), true);
  assert.equal(resolveFloatingAiHasDensePage("viewer", "/imports/123/viewer"), true);
  assert.equal(resolveFloatingAiHasDensePage("home", "/"), false);
});
