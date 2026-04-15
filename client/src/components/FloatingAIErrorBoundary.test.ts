import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FloatingAIErrorBoundary } from "@/components/FloatingAIErrorBoundary";
import { FloatingAIChatErrorBoundary } from "@/components/FloatingAIChatErrorBoundary";

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
