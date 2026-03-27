type ViewerVirtualRowStyleInput = {
  position?: string;
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  height?: number | string;
  width?: number | string;
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
