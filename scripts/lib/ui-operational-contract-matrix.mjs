export const operationalStressViewportSpecs = Object.freeze({
  compact: Object.freeze({
    id: "compact",
    width: 800,
    height: 900,
  }),
  "enlarged-text": Object.freeze({
    id: "enlarged-text",
    width: 1024,
    height: 900,
    rootFontSizePx: 20,
  }),
  "short-desktop": Object.freeze({
    id: "short-desktop",
    width: 1280,
    height: 600,
  }),
});

export const operationalContractRouteSpecs = Object.freeze([
  Object.freeze({
    id: "import",
    path: "/import",
    contentSelector: "main#main-content",
    readySelector: "[data-testid='tab-single-import']",
    stressViewportId: "enlarged-text",
  }),
  Object.freeze({
    id: "saved",
    path: "/saved",
    contentSelector: "main#main-content",
    readySelector: [
      "[data-testid='text-import-count']",
      "[data-testid='button-import-new']",
      "[data-testid='button-clear-filters-empty']",
      "[data-testid='saved-files-scroll-region']",
    ].join(", "),
    stressViewportId: "compact",
  }),
  Object.freeze({
    id: "activity",
    path: "/monitor?section=activity",
    contentSelector: "main#main-content",
    readySelector: "[data-testid='button-toggle-filters']",
    stressViewportId: "short-desktop",
  }),
  Object.freeze({
    id: "analysis",
    path: "/monitor?section=analysis",
    contentSelector: "main#main-content",
    readySelector: "[data-testid='text-analysis-title']",
    stressViewportId: "enlarged-text",
  }),
  Object.freeze({
    id: "audit-logs",
    path: "/monitor?section=audit",
    contentSelector: "main#main-content",
    readySelector: "[data-testid='text-audit-logs-title']",
    stressViewportId: "short-desktop",
  }),
  Object.freeze({
    id: "backup-restore",
    path: "/settings?section=backup-restore",
    contentSelector: "main#main-content",
    readySelector: "[data-testid='text-backup-title']",
    stressViewportId: "compact",
  }),
]);
