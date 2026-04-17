import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FloatingAIChatErrorBoundary } from "@/components/FloatingAIChatErrorBoundary";
import { FloatingAIErrorBoundary } from "@/components/FloatingAIErrorBoundary";
import { PanelErrorBoundary } from "@/components/PanelErrorBoundary";
import { assertNoAccessibilityViolations } from "@/test-utils/axe";

test("operational error boundary fallbacks remain accessible in the dedicated a11y suite", async () => {
  const panelBoundary = new PanelErrorBoundary({
    boundaryKey: "collections:records",
    panelLabel: "Rekod Collection",
    children: createElement("div", null, "ok"),
  });
  panelBoundary.state = {
    error: new Error("panel failed"),
    boundaryKey: "collections:records",
    failureCount: 2,
  };

  const shellBoundary = new FloatingAIErrorBoundary({
    boundaryKey: "dashboard:1",
    children: createElement("div", null, "ok"),
  });
  shellBoundary.state = {
    error: new Error("shell failed"),
    boundaryKey: "dashboard:1",
  };

  const chatBoundary = new FloatingAIChatErrorBoundary({
    boundaryKey: "dashboard:1",
    children: createElement("div", null, "ok"),
  });
  chatBoundary.state = {
    error: new Error("chat failed"),
    boundaryKey: "dashboard:1",
  };

  const markup = renderToStaticMarkup(
    createElement("main", { "aria-label": "Error boundary accessibility preview" }, [
      createElement("section", { key: "panel" }, panelBoundary.render()),
      createElement("section", { key: "shell" }, shellBoundary.render()),
      createElement("section", { key: "chat" }, chatBoundary.render()),
    ]),
  );

  await assertNoAccessibilityViolations(`<!doctype html><html lang="ms"><body>${markup}</body></html>`);
});
