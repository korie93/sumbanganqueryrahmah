export const AI_RESPONSE_REVEAL_TICK_MS = 40;
export const AI_RESPONSE_REVEAL_MAX_MS = 2400;

/** Catch up by elapsed time rather than scheduling one render per character. */
export function getAIResponseRevealIndex(text: string, elapsedMs: number, typingDelayMs: number): number {
  if (!text.length) return 0;
  const duration = Math.min(AI_RESPONSE_REVEAL_MAX_MS, text.length * Math.max(1, typingDelayMs));
  let end = Math.min(text.length, Math.floor(text.length * Math.min(1, Math.max(0, elapsedMs) / duration)));
  // A reveal boundary must not display half of a UTF-16 surrogate pair.
  if (end > 0 && end < text.length && /[\uD800-\uDBFF]/.test(text.charAt(end - 1))
    && /[\uDC00-\uDFFF]/.test(text.charAt(end))) end += 1;
  return end;
}

export function prefersReducedAIResponseMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
