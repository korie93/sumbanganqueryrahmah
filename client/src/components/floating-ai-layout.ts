import {
  buildOffsetCandidates,
  buildRect,
  chooseBestCandidate,
  clamp,
  normalizeRect,
  overlapScore,
  resolveBottomClearance,
} from "@/components/floating-ai-layout-geometry";
import type {
  FloatingAiLayout,
  FloatingAiLayoutInput,
  RectLike,
} from "@/components/floating-ai-layout-types";

export type {
  FloatingAiLayout,
  FloatingAiLayoutInput,
  RectLike,
} from "@/components/floating-ai-layout-types";

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

type TriggerCandidate = {
  anchor: "left" | "right";
  bottom: number;
  left: number | null;
  right: number | null;
  score: number;
};

function resolveInteriorTriggerLefts(
  avoidRects: readonly RectLike[],
  viewportWidth: number,
  viewportHeight: number,
  gutter: number,
  size: number,
  existingLefts: readonly number[],
  limit: number,
) {
  const maxLeft = Math.max(gutter, viewportWidth - gutter - size);
  const existing = new Set(existingLefts);
  // Keep a bounded, DOM-order-independent set of gaps between content columns.
  return Array.from(new Set(
    avoidRects.filter((rect) => rect.bottom > 0 && rect.top < viewportHeight)
      .flatMap((rect) => [rect.left - size - 8, rect.right + 8])
      .map((left) => clamp(left, gutter, maxLeft)),
  )).filter((left) => left > gutter && left < maxLeft && !existing.has(left))
    .sort((left, right) => right - left)
    .slice(0, limit);
}

function resolveDesktopPanelWidth(viewportWidth: number) {
  if (viewportWidth >= 1536) return 452;
  if (viewportWidth >= 1280) return 440;
  if (viewportWidth >= 1100) return 428;
  if (viewportWidth >= 960) return 412;
  return Math.min(392, Math.max(320, viewportWidth - 40));
}

function resolveDesktopPanelPreferredHeight(viewportHeight: number, hasDensePage: boolean) {
  const target = hasDensePage ? 532 : 576;
  const minimum = viewportHeight >= 820 ? 452 : 420;
  const scaled = Math.round(viewportHeight * (hasDensePage ? 0.62 : 0.67));
  return clamp(scaled, minimum, target);
}

export function resolveFloatingAiLayout(input: FloatingAiLayoutInput): FloatingAiLayout {
  const viewportWidth = Math.max(input.viewportWidth, 320);
  const viewportHeight = Math.max(input.viewportHeight, 480);
  const triggerViewportHeight = input.allowAdaptiveTriggerOffsets
    ? Math.max(input.viewportHeight, 1)
    : viewportHeight;
  const viewportBottomInset = Math.max(0, input.viewportBottomInset);
  const avoidRects = input.avoidRects.map(normalizeRect);

  const gutterX = input.isMobile ? 12 : 24;
  const gutterY = (input.isMobile ? 16 : 24) + viewportBottomInset;
  const triggerSize = input.isMobile ? 48 : 56;
  const topInset = input.isMobile ? 72 : 92;
  const shouldAutoMinimize =
    input.hasBlockingDialog || (input.isMobile && input.hasFocusedEditable);

  const baseTriggerBottomOffsets = buildOffsetCandidates(
    gutterY,
    Math.max(gutterY, triggerViewportHeight - topInset - triggerSize),
    [0, 72, 144, 216],
  );
  const triggerBottomOffsets = input.allowAdaptiveTriggerOffsets
    ? Array.from(new Set([
        ...baseTriggerBottomOffsets,
        ...avoidRects.filter((rect) => rect.bottom > 0 && rect.top < triggerViewportHeight)
          .flatMap((rect) => [
            triggerViewportHeight - rect.top + 8,
            triggerViewportHeight - rect.bottom - triggerSize - 8,
          ]).map((bottom) => clamp(bottom, gutterY, Math.max(gutterY, triggerViewportHeight - topInset - triggerSize))),
      ]))
    : baseTriggerBottomOffsets;
  const mobileTriggerCandidates: TriggerCandidate[] = (["right", "left"] as const).flatMap((anchor) =>
    triggerBottomOffsets.map((bottom) => {
      const isLeftAnchor = anchor === "left";
      const left = isLeftAnchor ? gutterX : viewportWidth - gutterX - triggerSize;
      const top = triggerViewportHeight - bottom - triggerSize;
      const rect = buildRect(left, top, triggerSize, triggerSize);
      const preferredBias = isLeftAnchor ? 0 : -80;

      return {
        anchor,
        bottom,
        left: isLeftAnchor ? gutterX : null,
        right: isLeftAnchor ? null : gutterX,
        score:
          overlapScore(rect, avoidRects, triggerViewportHeight)
          + (bottom - gutterY) * 2.1
          + preferredBias,
      };
    }),
  );

  if (input.isMobile && input.allowAdaptiveTriggerOffsets) {
    const maxLeft = Math.max(gutterX, viewportWidth - gutterX - triggerSize);
    // Keep both familiar corners first, then at most ten interior positions.
    // Value/label columns can leave a usable gap that neither corner reaches.
    const interiorLefts = resolveInteriorTriggerLefts(
      avoidRects, viewportWidth, triggerViewportHeight, gutterX, triggerSize,
      [gutterX, maxLeft], 10,
    );
    for (const left of interiorLefts) {
      for (const bottom of triggerBottomOffsets) {
        const rect = buildRect(left, triggerViewportHeight - bottom - triggerSize, triggerSize, triggerSize);
        mobileTriggerCandidates.push({
          anchor: "right",
          bottom,
          left: null,
          right: viewportWidth - left - triggerSize,
          score: overlapScore(rect, avoidRects, triggerViewportHeight)
            + (bottom - gutterY) * 2.1
            + (maxLeft - left) * 0.7
            + 80,
        });
      }
    }
  }

  const desktopTriggerRightOffsets = buildOffsetCandidates(
    gutterX,
    Math.max(gutterX, viewportWidth - triggerSize - 16),
    [0, 72, 144, 216],
  );
  const desktopTriggerCandidates: TriggerCandidate[] = desktopTriggerRightOffsets.flatMap((right) =>
    triggerBottomOffsets.map((bottom) => {
      const left = viewportWidth - right - triggerSize;
      const top = triggerViewportHeight - bottom - triggerSize;
      const rect = buildRect(left, top, triggerSize, triggerSize);
      return {
        anchor: "right" as const,
        bottom,
        left: null,
        right,
        score:
          overlapScore(rect, avoidRects, triggerViewportHeight)
          + (right - gutterX) * 2.4
          + (bottom - gutterY) * 2.9
          - 120,
      };
    }),
  );
  if (!input.isMobile && input.allowAdaptiveTriggerOffsets) {
    // Preserve the four legacy positions and add no more than eight gap edges.
    const interiorLefts = resolveInteriorTriggerLefts(
      avoidRects, viewportWidth, triggerViewportHeight, gutterX, triggerSize,
      desktopTriggerRightOffsets.map((right) => viewportWidth - right - triggerSize), 8,
    );
    for (const left of interiorLefts) {
      const right = viewportWidth - left - triggerSize;
      for (const bottom of triggerBottomOffsets) {
        const rect = buildRect(left, triggerViewportHeight - bottom - triggerSize, triggerSize, triggerSize);
        desktopTriggerCandidates.push({
          anchor: "right",
          bottom,
          left: null,
          right,
          score: overlapScore(rect, avoidRects, triggerViewportHeight)
            + (right - gutterX) * 2.4
            + (bottom - gutterY) * 2.9
            - 120
            + 80,
        });
      }
    }
  }
  const triggerCandidate = chooseBestCandidate(input.isMobile ? mobileTriggerCandidates : desktopTriggerCandidates);

  if (input.isMobile && input.isOpen) {
    const mobileSheetTopGap = clamp(Math.round(viewportHeight * 0.08), 20, 48);
    const shouldUseFullscreen =
      input.keyboardOpen || viewportWidth <= 340 || viewportHeight - viewportBottomInset - mobileSheetTopGap < 520;

    if (shouldUseFullscreen) {
      return {
        rootHidden: input.hasBlockingDialog,
        triggerHidden: true,
        shouldAutoMinimize,
        trigger: {
          bottom: triggerCandidate.bottom,
          left: triggerCandidate.anchor === "left" ? triggerCandidate.left : null,
          right: triggerCandidate.anchor === "right" ? triggerCandidate.right : null,
          anchor: triggerCandidate.anchor,
          size: triggerSize,
        },
        panel: {
          bottom: viewportBottomInset,
          left: 0,
          right: 0,
          width: viewportWidth,
          // Trigger scoring has a 480px floor; the visible panel must use the
          // actual viewport so landscape headers remain reachable.
          height: Math.max(1, input.viewportHeight - viewportBottomInset),
          mode: "fullscreen",
          alignment: "center",
        },
      };
    }

    const sheetWidth = clamp(
      viewportWidth - 12,
      input.preferCompactPanel ? 300 : 312,
      420,
    );
    const sheetLeft = clamp(
      Math.round((viewportWidth - sheetWidth) / 2),
      6,
      Math.max(6, viewportWidth - sheetWidth - 6),
    );
    const horizontalRect = {
      left: sheetLeft,
      right: sheetLeft + sheetWidth,
    };
    const minimumHeight = input.preferCompactPanel ? 420 : 520;
    const bottom = clamp(
      resolveBottomClearance(horizontalRect, viewportHeight, gutterY, avoidRects),
      gutterY,
      Math.max(gutterY, viewportHeight - mobileSheetTopGap - minimumHeight),
    );
    const availableHeight = Math.max(300, viewportHeight - mobileSheetTopGap - bottom);
    const preferredHeight = Math.round(
      availableHeight * (input.preferCompactPanel ? 0.82 : 0.9),
    );
    const height = clamp(preferredHeight, Math.min(minimumHeight, availableHeight), availableHeight);

    return {
      rootHidden: input.hasBlockingDialog,
      triggerHidden: true,
      shouldAutoMinimize,
      trigger: {
        bottom: triggerCandidate.bottom,
        left: triggerCandidate.anchor === "left" ? triggerCandidate.left : null,
        right: triggerCandidate.anchor === "right" ? triggerCandidate.right : null,
        anchor: triggerCandidate.anchor,
        size: triggerSize,
      },
      panel: {
        bottom,
        left: sheetLeft,
        right: null,
        width: sheetWidth,
        height,
        mode: "sheet",
        alignment: "center",
      },
    };
  }

  const preferredPanelWidth = input.isMobile
    ? clamp(viewportWidth - 16, input.preferCompactPanel ? 264 : 272, input.preferCompactPanel ? 340 : 360)
    : resolveDesktopPanelWidth(viewportWidth);
  const preferredPanelHeight = input.isMobile
    ? input.preferCompactPanel
      ? Math.min(248, Math.max(196, Math.round(viewportHeight * 0.3)))
      : Math.min(
          input.hasDensePage ? 404 : 448,
          Math.max(288, Math.round(viewportHeight * (input.hasDensePage ? 0.46 : 0.52))),
        )
    : resolveDesktopPanelPreferredHeight(viewportHeight, input.hasDensePage);
  const minimumPanelHeight = input.isMobile ? (input.preferCompactPanel ? 188 : 264) : (viewportHeight >= 760 ? 436 : 392);

  const desktopPanelRightOffsets = buildOffsetCandidates(
    gutterX,
    Math.max(gutterX, viewportWidth - preferredPanelWidth - 16),
    [0, 84, 168, 252],
  );
  const desktopPanelBottomOffsets = buildOffsetCandidates(
    gutterY,
    Math.max(gutterY, viewportHeight - topInset - 280),
    [0, 64, 128, 192],
  );
  const desktopPanelCandidates = desktopPanelRightOffsets.flatMap((right) =>
    desktopPanelBottomOffsets
      .map((bottom) => {
        const left = viewportWidth - right - preferredPanelWidth;
        if (left < 16) {
          return null;
        }

        const availableHeight = Math.max(220, viewportHeight - topInset - bottom);
        const height = clamp(
          preferredPanelHeight,
          Math.min(minimumPanelHeight, availableHeight),
          availableHeight,
        );
        const top = viewportHeight - bottom - height;
        const rect = buildRect(left, top, preferredPanelWidth, height);

        return {
          alignment: "right" as const,
          left: null,
          right,
          bottom,
          width: preferredPanelWidth,
          height,
          score:
            overlapScore(rect, avoidRects, viewportHeight)
            + (right - gutterX) * 1.75
            + (bottom - gutterY) * 3.5
            + Math.max(0, preferredPanelHeight - height) * 2.2,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null),
  );

  const panelCandidate = chooseBestCandidate(desktopPanelCandidates.length > 0 ? desktopPanelCandidates : [
    {
      alignment: "right" as const,
      left: null,
      right: gutterX,
      bottom: gutterY,
      width: preferredPanelWidth,
      height: clamp(
        preferredPanelHeight,
        Math.min(minimumPanelHeight, Math.max(220, viewportHeight - topInset - gutterY)),
        Math.max(220, viewportHeight - topInset - gutterY),
      ),
      score: 0,
    },
  ]);

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
      left: panelCandidate.left,
      right: panelCandidate.right,
      width: panelCandidate.width,
      height: panelCandidate.height,
      mode: input.isMobile ? "sheet" : "dock",
      alignment: panelCandidate.alignment,
    },
  };
}
