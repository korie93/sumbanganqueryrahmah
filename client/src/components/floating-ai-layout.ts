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

function resolveDesktopPanelWidth(viewportWidth: number) {
  if (viewportWidth >= 1536) return 420;
  if (viewportWidth >= 1280) return 408;
  if (viewportWidth >= 1100) return 396;
  if (viewportWidth >= 960) return 380;
  return Math.min(360, Math.max(320, viewportWidth - 40));
}

function resolveDesktopPanelPreferredHeight(viewportHeight: number, hasDensePage: boolean) {
  const target = hasDensePage ? 492 : 536;
  const minimum = viewportHeight >= 820 ? 452 : 420;
  const scaled = Math.round(viewportHeight * (hasDensePage ? 0.57 : 0.62));
  return clamp(scaled, minimum, target);
}

export function resolveFloatingAiLayout(input: FloatingAiLayoutInput): FloatingAiLayout {
  const viewportWidth = Math.max(input.viewportWidth, 320);
  const viewportHeight = Math.max(input.viewportHeight, 480);
  const viewportBottomInset = Math.max(0, input.viewportBottomInset);
  const avoidRects = input.avoidRects.map(normalizeRect);

  const gutterX = input.isMobile ? 12 : 24;
  const gutterY = (input.isMobile ? 16 : 24) + viewportBottomInset;
  const triggerSize = input.isMobile ? 48 : 56;
  const topInset = input.isMobile ? 72 : 92;
  const shouldAutoMinimize =
    input.hasBlockingDialog || (input.isMobile && input.hasFocusedEditable);

  const mobileTriggerBottomOffsets = buildOffsetCandidates(
    gutterY,
    Math.max(gutterY, viewportHeight - topInset - triggerSize),
    [0, 72, 144, 216],
  );
  const mobileTriggerCandidates: TriggerCandidate[] = (["right", "left"] as const).flatMap((anchor) =>
    mobileTriggerBottomOffsets.map((bottom) => {
      const isLeftAnchor = anchor === "left";
      const left = isLeftAnchor ? gutterX : viewportWidth - gutterX - triggerSize;
      const top = viewportHeight - bottom - triggerSize;
      const rect = buildRect(left, top, triggerSize, triggerSize);
      const preferredBias = isLeftAnchor ? 0 : -80;

      return {
        anchor,
        bottom,
        left: isLeftAnchor ? gutterX : null,
        right: isLeftAnchor ? null : gutterX,
        score:
          overlapScore(rect, avoidRects, viewportHeight)
          + (bottom - gutterY) * 2.1
          + preferredBias,
      };
    }),
  );

  const desktopTriggerRightOffsets = buildOffsetCandidates(
    gutterX,
    Math.max(gutterX, viewportWidth - triggerSize - 16),
    [0, 72, 144, 216],
  );
  const desktopTriggerBottomOffsets = buildOffsetCandidates(
    gutterY,
    Math.max(gutterY, viewportHeight - topInset - triggerSize),
    [0, 72, 144, 216],
  );
  const desktopTriggerCandidates: TriggerCandidate[] = desktopTriggerRightOffsets.flatMap((right) =>
    desktopTriggerBottomOffsets.map((bottom) => {
      const left = viewportWidth - right - triggerSize;
      const top = viewportHeight - bottom - triggerSize;
      const rect = buildRect(left, top, triggerSize, triggerSize);
      return {
        anchor: "right" as const,
        bottom,
        left: null,
        right,
        score:
          overlapScore(rect, avoidRects, viewportHeight)
          + (right - gutterX) * 2.4
          + (bottom - gutterY) * 2.9
          - 120,
      };
    }),
  );
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
          height: Math.max(320, viewportHeight - viewportBottomInset),
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
