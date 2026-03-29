export type RectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width?: number;
  height?: number;
};

export type FloatingAiLayoutInput = {
  viewportWidth: number;
  viewportHeight: number;
  isMobile: boolean;
  isOpen: boolean;
  hasBlockingDialog: boolean;
  keyboardOpen: boolean;
  hasFocusedEditable: boolean;
  hasDensePage: boolean;
  avoidRects: ReadonlyArray<RectLike>;
};

export type FloatingAiLayout = {
  rootHidden: boolean;
  triggerHidden: boolean;
  shouldAutoMinimize: boolean;
  trigger: {
    bottom: number;
    left: number | null;
    right: number | null;
    anchor: "left" | "right";
    size: number;
  };
  panel: {
    bottom: number;
    left: number | null;
    right: number | null;
    width: number;
    height: number;
    mode: "dock" | "sheet";
    alignment: "left" | "right" | "center";
  };
};

export function areFloatingAiLayoutsEqual(left: FloatingAiLayout, right: FloatingAiLayout) {
  return (
    left.rootHidden === right.rootHidden &&
    left.triggerHidden === right.triggerHidden &&
    left.shouldAutoMinimize === right.shouldAutoMinimize &&
    left.trigger.bottom === right.trigger.bottom &&
    left.trigger.left === right.trigger.left &&
    left.trigger.right === right.trigger.right &&
    left.trigger.anchor === right.trigger.anchor &&
    left.trigger.size === right.trigger.size &&
    left.panel.bottom === right.panel.bottom &&
    left.panel.left === right.panel.left &&
    left.panel.right === right.panel.right &&
    left.panel.width === right.panel.width &&
    left.panel.height === right.panel.height &&
    left.panel.mode === right.panel.mode &&
    left.panel.alignment === right.panel.alignment
  );
}

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeRect(rect: RectLike): Rect {
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

function buildRect(left: number, top: number, width: number, height: number): Rect {
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

function overlapScore(rect: Rect, avoidRects: ReadonlyArray<Rect>, viewportHeight: number) {
  const paddedRect = inflateRect(rect, 8);

  return avoidRects.reduce((score, avoidRect) => {
    const area = overlapArea(paddedRect, avoidRect);
    if (area === 0) return score;

    const nearBottomWeight = avoidRect.top >= viewportHeight * 0.5 ? 1.8 : 1.15;
    const wideSurfaceWeight = avoidRect.width >= rect.width * 0.7 ? 1.15 : 1;
    return score + area * nearBottomWeight * wideSurfaceWeight;
  }, 0);
}

function resolveBottomClearance(
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

    const isBottomWeighted =
      avoidRect.bottom >= viewportHeight - 220 || avoidRect.top >= viewportHeight * 0.5;
    if (!isBottomWeighted) continue;

    clearance = Math.max(clearance, viewportHeight - avoidRect.top + 12);
  }

  return clearance;
}

function chooseBestCandidate<T extends { score: number }>(candidates: readonly T[]) {
  return candidates.reduce((best, candidate) => (candidate.score < best.score ? candidate : best));
}

export function resolveFloatingAiLayout(input: FloatingAiLayoutInput): FloatingAiLayout {
  const viewportWidth = Math.max(input.viewportWidth, 320);
  const viewportHeight = Math.max(input.viewportHeight, 480);
  const avoidRects = input.avoidRects.map(normalizeRect);

  const gutterX = input.isMobile ? 12 : 20;
  const gutterY = input.isMobile ? 16 : 20;
  const triggerSize = input.isMobile ? 48 : 56;
  const topInset = input.isMobile ? 72 : 92;
  const shouldAutoMinimize =
    input.hasBlockingDialog || (input.isMobile && (input.keyboardOpen || input.hasFocusedEditable));

  const triggerCandidates = [
    {
      anchor: "right" as const,
      bottom: gutterY,
      left: viewportWidth - gutterX - triggerSize,
      right: gutterX,
      score: 0,
    },
    {
      anchor: "left" as const,
      bottom: gutterY,
      left: gutterX,
      right: null,
      score: 0,
    },
  ].map((candidate) => {
    const top = viewportHeight - candidate.bottom - triggerSize;
    const rect = buildRect(candidate.left, top, triggerSize, triggerSize);
    const preferredBias = candidate.anchor === "right" ? -80 : 0;

    return {
      ...candidate,
      score: overlapScore(rect, avoidRects, viewportHeight) + preferredBias,
    };
  });

  const triggerCandidate = chooseBestCandidate(triggerCandidates);

  const preferredPanelWidth = input.isMobile
    ? clamp(viewportWidth - 16, 272, 360)
    : clamp(Math.min(392, viewportWidth - 48), 320, 392);
  const preferredPanelHeight = input.isMobile
    ? Math.min(
        input.hasDensePage ? 360 : 420,
        Math.max(252, Math.round(viewportHeight * (input.hasDensePage ? 0.42 : 0.48))),
      )
    : Math.min(
        input.hasDensePage ? 420 : 520,
        Math.max(300, viewportHeight - (input.hasDensePage ? 176 : 136)),
      );
  const minimumPanelHeight = input.isMobile ? 220 : 260;
  const preferredPanelAlignments = input.isMobile
    ? (["center", "left", "right"] as const)
    : ([triggerCandidate.anchor, triggerCandidate.anchor === "right" ? "left" : "right", "center"] as const);

  const panelCandidates = preferredPanelAlignments.map((alignment, index) => {
    let left = gutterX;

    if (alignment === "center") {
      left = Math.round((viewportWidth - preferredPanelWidth) / 2);
    } else if (alignment === "right") {
      left = viewportWidth - gutterX - preferredPanelWidth;
    }

    left = clamp(left, gutterX, Math.max(gutterX, viewportWidth - preferredPanelWidth - gutterX));
    const horizontalRect = {
      left,
      right: left + preferredPanelWidth,
    };
    const bottom = resolveBottomClearance(horizontalRect, viewportHeight, gutterY, avoidRects);
    const availableHeight = Math.max(180, viewportHeight - topInset - bottom);
    const height = clamp(preferredPanelHeight, Math.min(minimumPanelHeight, availableHeight), availableHeight);
    const top = viewportHeight - bottom - height;
    const rect = buildRect(left, top, preferredPanelWidth, height);
    const overlapPenalty = overlapScore(rect, avoidRects, viewportHeight);
    const alignmentPenalty = index * 48;
    const tightViewportPenalty = availableHeight < minimumPanelHeight ? 800 : 0;

    return {
      alignment,
      left,
      right: viewportWidth - left - preferredPanelWidth,
      bottom,
      width: preferredPanelWidth,
      height,
      score: overlapPenalty + alignmentPenalty + tightViewportPenalty,
    };
  });

  const panelCandidate = chooseBestCandidate(panelCandidates);

  return {
    rootHidden: input.hasBlockingDialog,
    triggerHidden: shouldAutoMinimize || input.isOpen,
    shouldAutoMinimize,
    trigger: {
      bottom: triggerCandidate.bottom,
      left: triggerCandidate.anchor === "left" ? triggerCandidate.left : null,
      right: triggerCandidate.anchor === "right" ? triggerCandidate.right : null,
      anchor: triggerCandidate.anchor,
      size: triggerSize,
    },
    panel: {
      bottom: panelCandidate.bottom,
      left: panelCandidate.alignment === "right" ? null : panelCandidate.left,
      right:
        panelCandidate.alignment === "left"
          ? null
          : panelCandidate.alignment === "center"
            ? null
            : panelCandidate.right,
      width: panelCandidate.width,
      height: panelCandidate.height,
      mode: input.isMobile ? "sheet" : "dock",
      alignment: panelCandidate.alignment,
    },
  };
}
