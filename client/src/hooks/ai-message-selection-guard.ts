type AIMessageSelectionSnapshot = {
  anchorNode: Node | null;
  anchorOffset: number;
  focusNode: Node | null;
  focusOffset: number;
  rangeCount: number;
};

export type AIMessageSelectionGuard = {
  isPaused: () => boolean;
  resume: () => void;
  reset: () => void;
  dispose: () => void;
};

function readSelectionInLog(element: HTMLElement): AIMessageSelectionSnapshot | null {
  if (!element.isConnected) return null;
  const selection = element.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  for (let index = 0; index < selection.rangeCount; index++) {
    try {
      if (!selection.getRangeAt(index).intersectsNode(element)) continue;
      return {
        anchorNode: selection.anchorNode,
        anchorOffset: selection.anchorOffset,
        focusNode: selection.focusNode,
        focusOffset: selection.focusOffset,
        rangeCount: selection.rangeCount,
      };
    } catch {
      // A native range can be detached while an answer or session is removed.
    }
  }
  return null;
}

function hasSameEndpoints(current: AIMessageSelectionSnapshot, ignored: AIMessageSelectionSnapshot | null): boolean {
  return ignored !== null
    && current.anchorNode === ignored.anchorNode
    && current.anchorOffset === ignored.anchorOffset
    && current.focusNode === ignored.focusNode
    && current.focusOffset === ignored.focusOffset
    && current.rangeCount === ignored.rangeCount;
}

/** Pauses follow for native log selections without changing selection or copy behavior. */
export function bindAIMessageSelectionGuard(element: HTMLElement, onPause: () => void): AIMessageSelectionGuard {
  let container: HTMLElement | null = element;
  let ownerDocument: Document | null = element.ownerDocument;
  let pause: (() => void) | null = onPause;
  let paused = false;
  let ignoredSelection: AIMessageSelectionSnapshot | null = null;

  const syncSelection = () => {
    if (!container) return false;
    const current = readSelectionInLog(container);
    if (!current) {
      paused = false;
      ignoredSelection = null;
      return false;
    }
    // Explicitly activating the jump control also works with keyboard focus:
    // it need not erase an existing selection to resume automatic following.
    if (hasSameEndpoints(current, ignoredSelection)) return false;
    ignoredSelection = null;
    if (!paused) {
      paused = true;
      pause?.();
    }
    return true;
  };

  ownerDocument.addEventListener("selectionchange", syncSelection, { passive: true });
  syncSelection();

  return {
    isPaused: syncSelection,
    resume: () => {
      paused = false;
      ignoredSelection = container ? readSelectionInLog(container) : null;
    },
    reset: () => {
      paused = false;
      ignoredSelection = null;
    },
    dispose: () => {
      ownerDocument?.removeEventListener("selectionchange", syncSelection);
      paused = false;
      ignoredSelection = null;
      container = null;
      ownerDocument = null;
      pause = null;
    },
  };
}
