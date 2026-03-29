import test from "node:test";
import assert from "node:assert/strict";

import { applyFloatingAiScrollLock } from "@/components/floating-ai-scroll-lock";

test("applyFloatingAiScrollLock locks the page and restores prior styles on cleanup", () => {
  const bodyStyle = {
    overflow: "auto",
    overscrollBehavior: "",
  };
  const documentElementStyle = {
    overflow: "",
    overscrollBehavior: "contain",
  };

  const restore = applyFloatingAiScrollLock({
    bodyStyle,
    documentElementStyle,
  });

  assert.equal(bodyStyle.overflow, "hidden");
  assert.equal(documentElementStyle.overscrollBehavior, "none");

  restore();

  assert.equal(bodyStyle.overflow, "auto");
  assert.equal(documentElementStyle.overscrollBehavior, "contain");
});

test("applyFloatingAiScrollLock cleanup is idempotent", () => {
  const bodyStyle = {
    overflow: "",
    overscrollBehavior: "",
  };
  const documentElementStyle = {
    overflow: "",
    overscrollBehavior: "",
  };

  const restore = applyFloatingAiScrollLock({
    bodyStyle,
    documentElementStyle,
  });

  restore();
  restore();

  assert.equal(bodyStyle.overflow, "");
  assert.equal(documentElementStyle.overscrollBehavior, "");
});
