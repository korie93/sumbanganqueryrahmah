type FocusTarget = {
  focus: (options?: { preventScroll?: boolean }) => void;
};

type DocumentLike = {
  getElementById: (id: string) => FocusTarget | null;
};

type WindowLike = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
};

export function focusMainContent(documentLike: DocumentLike = document): boolean {
  const mainContent = documentLike.getElementById("main-content");
  if (!mainContent) {
    return false;
  }

  try {
    mainContent.focus({ preventScroll: true });
  } catch {
    mainContent.focus();
  }
  return true;
}

export function scheduleMainContentFocus(
  windowLike: WindowLike = window,
  documentLike: DocumentLike = document,
): () => void {
  let nestedFrameHandle: number | null = null;
  const frameHandle = windowLike.requestAnimationFrame(() => {
    nestedFrameHandle = windowLike.requestAnimationFrame(() => {
      focusMainContent(documentLike);
    });
  });

  return () => {
    windowLike.cancelAnimationFrame(frameHandle);
    if (nestedFrameHandle !== null) {
      windowLike.cancelAnimationFrame(nestedFrameHandle);
    }
  };
}
