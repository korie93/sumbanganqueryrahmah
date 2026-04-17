import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FloatingAIErrorBoundary } from "@/components/FloatingAIErrorBoundary";
import { FloatingAIChatErrorBoundary } from "@/components/FloatingAIChatErrorBoundary";
import { assertNoAccessibilityViolations } from "@/test-utils/axe";

test("FloatingAIErrorBoundary renders a stable recovery notice after a FloatingAI failure", () => {
  const boundary = new FloatingAIErrorBoundary({
    boundaryKey: "dashboard:1",
    children: createElement("div", null, "ok"),
  });

  boundary.state = {
    error: new Error("boom"),
    boundaryKey: "dashboard:1",
  };

  const markup = renderToStaticMarkup(boundary.render());
  assert.match(markup, /Pembantu AI tidak tersedia buat sementara waktu/i);
  assert.match(markup, /Cuba semula AI/i);
});

test("FloatingAIChatErrorBoundary renders isolated AI chat fallback content", () => {
  const boundary = new FloatingAIChatErrorBoundary({
    boundaryKey: "dashboard:1",
    children: createElement("div", null, "ok"),
  });

  boundary.state = {
    error: new Error("chat failed"),
    boundaryKey: "dashboard:1",
  };

  const markup = renderToStaticMarkup(boundary.render());
  assert.match(markup, /AI chat tidak dapat dimuatkan/i);
  assert.match(markup, /halaman anda masih selamat digunakan/i);
});

test("FloatingAI error-boundary fallbacks remain accessible", async () => {
  const shellBoundary = new FloatingAIErrorBoundary({
    boundaryKey: "dashboard:1",
    children: createElement("div", null, "ok"),
  });
  shellBoundary.state = {
    error: new Error("boom"),
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
    createElement("main", { "aria-label": "AI fallback preview" }, [
      createElement("section", { key: "shell" }, shellBoundary.render()),
      createElement("section", { key: "chat" }, chatBoundary.render()),
    ]),
  );

  await assertNoAccessibilityViolations(`<!doctype html><html lang="ms"><body>${markup}</body></html>`);
});
