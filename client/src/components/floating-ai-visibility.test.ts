import assert from "node:assert/strict";
import test from "node:test";

import { shouldKeepFloatingAiPanelMounted } from "@/components/floating-ai-visibility";

test("shouldKeepFloatingAiPanelMounted stays mounted while the panel is open", () => {
  assert.equal(
    shouldKeepFloatingAiPanelMounted({
      hasActivated: true,
      isOpen: true,
      isThinking: false,
      aiStatus: "IDLE",
    }),
    true,
  );
});

test("shouldKeepFloatingAiPanelMounted stays mounted while AI is still processing in the background", () => {
  assert.equal(
    shouldKeepFloatingAiPanelMounted({
      hasActivated: true,
      isOpen: false,
      isThinking: true,
      aiStatus: "PROCESSING",
    }),
    true,
  );
});

test("shouldKeepFloatingAiPanelMounted unmounts once minimized idle state is restored", () => {
  assert.equal(
    shouldKeepFloatingAiPanelMounted({
      hasActivated: true,
      isOpen: false,
      isThinking: false,
      aiStatus: "IDLE",
    }),
    false,
  );
});
