import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeViewerVirtualRowStyle,
} from "@/pages/viewer/viewer-virtual-row-style";

test("normalizeViewerVirtualRowStyle converts numeric react-window values into css-safe strings", () => {
  const normalized = normalizeViewerVirtualRowStyle({
    position: "absolute",
    top: 144,
    left: 0,
    height: 48,
    width: "100%",
  });

  assert.deepEqual(normalized, {
    position: "absolute",
    top: "144px",
    left: "0px",
    right: "",
    bottom: "",
    height: "48px",
    width: "100%",
  });
});

test("normalizeViewerVirtualRowStyle clears unsupported or missing positioning fields safely", () => {
  const normalized = normalizeViewerVirtualRowStyle({});

  assert.deepEqual(normalized, {
    position: "",
    top: "",
    left: "",
    right: "",
    bottom: "",
    height: "",
    width: "",
  });
});
