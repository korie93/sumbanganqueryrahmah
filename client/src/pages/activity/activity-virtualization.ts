export const ACTIVITY_MOBILE_ROW_HEIGHT_PX = 320;
export const ACTIVITY_MOBILE_LIST_MAX_HEIGHT_PX = 720;
export const ACTIVITY_DESKTOP_ROW_HEIGHT_PX = 72;
export const ACTIVITY_DESKTOP_LIST_MAX_HEIGHT_PX = 360;
export const ACTIVITY_DESKTOP_GRID_CLASSNAME_WITH_ACTIONS =
  "grid-cols-[3rem_minmax(10rem,_1.25fr)_6.5rem_10rem_minmax(12rem,_1.2fr)_8.5rem_8.5rem_7rem_minmax(7rem,_auto)]";
export const ACTIVITY_DESKTOP_GRID_CLASSNAME_WITHOUT_ACTIONS =
  "grid-cols-[minmax(10rem,_1.25fr)_6.5rem_10rem_minmax(12rem,_1.2fr)_8.5rem_8.5rem_7rem]";

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
