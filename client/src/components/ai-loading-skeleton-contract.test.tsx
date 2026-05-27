import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";

import {
  AI_PROCESSING_INDICATOR_DELAY_MS,
  AILoadingSkeleton,
} from "@/components/AILoadingSkeleton";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readClientSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("AI loading skeleton exposes an accessible delayed status", () => {
  const markup = renderToStaticMarkup(<AILoadingSkeleton label="AI test loading" />);

  assert.equal(AI_PROCESSING_INDICATOR_DELAY_MS, 300);
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /aria-atomic="true"/);
  assert.match(markup, /aria-label="AI test loading"/);
  assert.match(markup, /ai-loading-skeleton-line--wide/);
});

test("AI processing indicator delay cleans up timers and is used by both AI surfaces", () => {
  const hookSource = readClientSource("useDelayedVisibleFlag.ts");
  const aiChatSource = readClientSource("AIChat.tsx");
  const aiPageSource = readClientSource("../pages/ai/AIConversationCard.tsx");
  const aiCssSource = readClientSource("../styles/ai.css");

  assert.match(hookSource, /window\.setTimeout/);
  assert.match(hookSource, /window\.clearTimeout\(timer\)/);
  assert.match(aiChatSource, /useDelayedVisibleFlag\(/);
  assert.match(aiChatSource, /<AILoadingSkeleton/);
  assert.match(aiPageSource, /useDelayedVisibleFlag\(/);
  assert.match(aiPageSource, /<AILoadingSkeleton/);
  assert.match(aiCssSource, /@keyframes aiLoadingShimmer/);
  assert.match(aiCssSource, /prefers-reduced-motion: reduce/);
  assert.match(aiCssSource, /\.ai-loading-skeleton-line\s*{[\s\S]*animation: aiLoadingShimmer/);
});
