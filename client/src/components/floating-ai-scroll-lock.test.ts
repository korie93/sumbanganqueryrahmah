import test from "node:test";
import assert from "node:assert/strict";

import { applyFloatingAiScrollLock } from "@/components/floating-ai-scroll-lock";

test("applyFloatingAiScrollLock locks the page and restores prior styles on cleanup", () => {
  const bodyStyle = {
    overflow: "auto",
    overscrollBehavior: "",
    position: "",
    top: "",
    left: "",
    right: "",
    width: "",
  };
  const documentElementStyle = {
    overflow: "auto",
    overscrollBehavior: "contain",
  };
  let restoredScrollY = -1;

  const restore = applyFloatingAiScrollLock({
    bodyStyle,
    documentElementStyle,
    windowObject: {
      scrollY: 240,
      scrollTo: (_x, y) => {
        restoredScrollY = y;
      },
    },
  });

  assert.equal(bodyStyle.overflow, "hidden");
  assert.equal(bodyStyle.position, "fixed");
  assert.equal(bodyStyle.top, "-240px");
  assert.equal(bodyStyle.width, "100%");
  assert.equal(documentElementStyle.overflow, "hidden");
  assert.equal(documentElementStyle.overscrollBehavior, "none");

  restore();

  assert.equal(bodyStyle.overflow, "auto");
  assert.equal(bodyStyle.position, "");
  assert.equal(bodyStyle.top, "");
  assert.equal(bodyStyle.width, "");
  assert.equal(documentElementStyle.overflow, "auto");
  assert.equal(documentElementStyle.overscrollBehavior, "contain");
  assert.equal(restoredScrollY, 240);
});

test("applyFloatingAiScrollLock cleanup is idempotent", () => {
  const bodyStyle = {
    overflow: "",
    overscrollBehavior: "",
    position: "",
    top: "",
    left: "",
    right: "",
    width: "",
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
  assert.equal(bodyStyle.position, "");
  assert.equal(documentElementStyle.overscrollBehavior, "");
  assert.equal(documentElementStyle.overflow, "");
});
