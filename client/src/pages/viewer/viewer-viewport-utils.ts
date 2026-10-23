/** Reserve app chrome, title, toolbar, scroll controls and pagination; never clip them. */
export function getViewerViewportHeight(windowHeight: number) {
  const height = Number.isFinite(windowHeight) ? windowHeight : 900;
  return Math.max(240, Math.min(960, Math.floor(height - 330)));
}
