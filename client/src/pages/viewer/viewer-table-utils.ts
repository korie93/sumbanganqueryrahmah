export function buildViewerVisibleFieldsSummary(visibleHeadersCount: number, previewLimit = 4) {
  if (visibleHeadersCount <= 0) {
    return "No visible columns selected";
  }

  const shownCount = Math.min(visibleHeadersCount, previewLimit);
  return `${shownCount} field${visibleHeadersCount === 1 ? "" : "s"} shown`;
}

export function buildViewerOverflowFieldsLabel(overflowCount: number) {
  return `Show ${overflowCount} more field${overflowCount === 1 ? "" : "s"}`;
}
