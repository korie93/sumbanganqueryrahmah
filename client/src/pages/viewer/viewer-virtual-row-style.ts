type ViewerVirtualRowStyleInput = {
  position?: string | undefined;
  top?: number | string | undefined;
  left?: number | string | undefined;
  right?: number | string | undefined;
  bottom?: number | string | undefined;
  height?: number | string | undefined;
  width?: number | string | undefined;
};

const VIEWER_VIRTUAL_ROW_STYLE_KEYS = [
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "height",
  "width",
] as const;

function normalizeViewerVirtualCssValue(value: number | string | undefined): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return `${value}px`;
  }

  return value;
}

export function normalizeViewerVirtualRowStyle(
  style: ViewerVirtualRowStyleInput,
): Record<(typeof VIEWER_VIRTUAL_ROW_STYLE_KEYS)[number], string> {
  return {
    position: typeof style.position === "string" ? style.position : "",
    top: normalizeViewerVirtualCssValue(style.top),
    left: normalizeViewerVirtualCssValue(style.left),
    right: normalizeViewerVirtualCssValue(style.right),
    bottom: normalizeViewerVirtualCssValue(style.bottom),
    height: normalizeViewerVirtualCssValue(style.height),
    width: normalizeViewerVirtualCssValue(style.width),
  };
}

export function applyViewerVirtualRowStyle(
  target: CSSStyleDeclaration,
  style: ViewerVirtualRowStyleInput,
) {
  const normalized = normalizeViewerVirtualRowStyle(style);

  for (const key of VIEWER_VIRTUAL_ROW_STYLE_KEYS) {
    target[key] = normalized[key];
  }
}
