export const ACTIVITY_MOBILE_ROW_HEIGHT_PX = 580;
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
