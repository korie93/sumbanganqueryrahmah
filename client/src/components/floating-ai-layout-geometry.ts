import type { RectLike } from "@/components/floating-ai-layout-types";

export type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeRect(rect: RectLike): Rect {
  const width = rect.width ?? Math.max(0, rect.right - rect.left);
  const height = rect.height ?? Math.max(0, rect.bottom - rect.top);
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width,
    height,
  };
}

export function buildRect(left: number, top: number, width: number, height: number): Rect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

function inflateRect(rect: Rect, padding: number): Rect {
  return {
    left: rect.left - padding,
    top: rect.top - padding,
    right: rect.right + padding,
    bottom: rect.bottom + padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function overlapArea(a: Rect, b: Rect) {
  const horizontal = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const vertical = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return horizontal * vertical;
}

export function overlapScore(rect: Rect, avoidRects: ReadonlyArray<Rect>, viewportHeight: number) {
  const paddedRect = inflateRect(rect, 8);

  return avoidRects.reduce((score, avoidRect) => {
    const area = overlapArea(paddedRect, avoidRect);
    if (area === 0) return score;

    const nearBottomWeight = avoidRect.top >= viewportHeight * 0.5 ? 1.8 : 1.15;
    const wideSurfaceWeight = avoidRect.width >= rect.width * 0.7 ? 1.15 : 1;
    return score + area * nearBottomWeight * wideSurfaceWeight;
  }, 0);
}

export function resolveBottomClearance(
  horizontalRect: Pick<Rect, "left" | "right">,
  viewportHeight: number,
  baseBottom: number,
  avoidRects: ReadonlyArray<Rect>,
) {
  let clearance = baseBottom;

  for (const avoidRect of avoidRects) {
    const overlapsHorizontally =
      Math.min(horizontalRect.right, avoidRect.right) > Math.max(horizontalRect.left, avoidRect.left);
    if (!overlapsHorizontally) continue;

    const isShortBottomSurface = avoidRect.height <= 220 && avoidRect.bottom >= viewportHeight - 32;
    const startsInBottomBand = avoidRect.top >= viewportHeight * 0.62;
    const isBottomWeighted = startsInBottomBand || isShortBottomSurface;
    if (!isBottomWeighted) continue;

    clearance = Math.max(clearance, viewportHeight - avoidRect.top + 12);
  }

  return clearance;
}

export function chooseBestCandidate<T extends { score: number }>(candidates: readonly T[]) {
  return candidates.reduce((best, candidate) => (candidate.score < best.score ? candidate : best));
}

export function buildOffsetCandidates(baseOffset: number, maxOffset: number, stepOffsets: readonly number[]) {
  return Array.from(
    new Set(
      stepOffsets.map((step) => clamp(baseOffset + step, baseOffset, maxOffset)),
    ),
  );
}
