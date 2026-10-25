export const VIEWER_PAGE_SIZE_CHOICES = [25, 50, 100] as const;

export function resolveInitialViewerPageSize(
  configuredSize: number | undefined,
  cardLayout: boolean,
  lowSpec: boolean,
) {
  if (cardLayout) return 25;
  const parsed = Number(configuredSize);
  return Number.isFinite(parsed) ? Math.min(500, Math.max(10, Math.floor(parsed))) : lowSpec ? 40 : 100;
}

export function isViewerPageSizeChoice(value: number) {
  return VIEWER_PAGE_SIZE_CHOICES.some((size) => size === value);
}

export function getViewerPageSizeOptions(currentSize: number): number[] {
  // A configured desktop size (e.g. 40 or 200) remains represented as selected.
  return [...new Set<number>([...VIEWER_PAGE_SIZE_CHOICES, currentSize])].sort((a, b) => a - b);
}
