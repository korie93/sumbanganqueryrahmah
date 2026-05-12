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
  viewportBottomInset: number;
  isMobile: boolean;
  isOpen: boolean;
  hasBlockingDialog: boolean;
  keyboardOpen: boolean;
  hasFocusedEditable: boolean;
  hasDensePage: boolean;
  preferCompactPanel: boolean;
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
    mode: "dock" | "sheet" | "fullscreen";
    alignment: "left" | "right" | "center";
  };
};
