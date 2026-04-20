export const ACTIVITY_MOBILE_ROW_HEIGHT_PX = 320;
export const ACTIVITY_MOBILE_LIST_MAX_HEIGHT_PX = 720;
export const ACTIVITY_DESKTOP_ROW_HEIGHT_PX = 72;
export const ACTIVITY_DESKTOP_LIST_MAX_HEIGHT_PX = 360;
export const ACTIVITY_DESKTOP_VIRTUALIZATION_THRESHOLD = 10;
export const ACTIVITY_DESKTOP_GRID_CLASSNAME_WITH_ACTIONS =
  "grid-cols-[3rem_minmax(10rem,_1.25fr)_6.5rem_10rem_minmax(12rem,_1.2fr)_8.5rem_8.5rem_7rem_minmax(7rem,_auto)]";
export const ACTIVITY_DESKTOP_GRID_CLASSNAME_WITHOUT_ACTIONS =
  "grid-cols-[minmax(10rem,_1.25fr)_6.5rem_10rem_minmax(12rem,_1.2fr)_8.5rem_8.5rem_7rem]";

type ActivityVirtualRowStyleInput = {
  position?: string | undefined;
  top?: number | string | undefined;
  left?: number | string | undefined;
  right?: number | string | undefined;
  bottom?: number | string | undefined;
  height?: number | string | undefined;
  width?: number | string | undefined;
};

const ACTIVITY_VIRTUAL_ROW_STYLE_KEYS = [
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "height",
  "width",
] as const;

export function getVirtualizedListHeight(
  itemCount: number,
  itemSize: number,
  maxHeight: number,
): number {
  if (itemCount <= 0) {
    return itemSize;
  }

  return Math.max(itemSize, Math.min(itemCount * itemSize, maxHeight));
}

export function getActivityDesktopGridClassName(canModerateActivity: boolean): string {
  if (canModerateActivity) {
    return ACTIVITY_DESKTOP_GRID_CLASSNAME_WITH_ACTIONS;
  }

  return ACTIVITY_DESKTOP_GRID_CLASSNAME_WITHOUT_ACTIONS;
}

export function normalizeActivityVirtualCssValue(value: number | string | undefined): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return `${value}px`;
  }

  return value;
}

export function applyActivityVirtualRowStyle(
  target: CSSStyleDeclaration,
  style: ActivityVirtualRowStyleInput,
) {
  for (const key of ACTIVITY_VIRTUAL_ROW_STYLE_KEYS) {
    if (key === "position") {
      target.position = typeof style.position === "string" ? style.position : "";
      continue;
    }

    target[key] = normalizeActivityVirtualCssValue(style[key]);
  }
}

export function shouldVirtualizeActivityDesktopLogs(activityCount: number): boolean {
  return Math.max(0, Math.trunc(activityCount)) > ACTIVITY_DESKTOP_VIRTUALIZATION_THRESHOLD;
}
