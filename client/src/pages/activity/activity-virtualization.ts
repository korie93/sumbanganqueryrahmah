export const ACTIVITY_MOBILE_ROW_HEIGHT_PX = 320;
export const ACTIVITY_MOBILE_LIST_MAX_HEIGHT_PX = 720;
export const ACTIVITY_DESKTOP_ROW_HEIGHT_PX = 72;
export const ACTIVITY_DESKTOP_LIST_MAX_HEIGHT_PX = 360;

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

export function getActivityDesktopGridTemplate(canModerateActivity: boolean): string {
  if (canModerateActivity) {
    return "3rem minmax(10rem, 1.25fr) 6.5rem 10rem minmax(12rem, 1.2fr) 8.5rem 8.5rem 7rem minmax(7rem, auto)";
  }

  return "minmax(10rem, 1.25fr) 6.5rem 10rem minmax(12rem, 1.2fr) 8.5rem 8.5rem 7rem";
}
