export type SidebarIconMotion = "lift" | "inspect" | "tilt";

/** Small, transform-only gestures shared by desktop menu and flyout icons. */
export const SIDEBAR_ICON_MOTION_BY_ID = {
  home: "lift",
  "general-search": "inspect",
  "collection-report": "lift",
  workspace: "lift",
  import: "lift",
  saved: "lift",
  viewer: "inspect",
  insights: "lift",
  dashboard: "lift",
  activity: "lift",
  monitor: "inspect",
  analysis: "lift",
  "audit-logs": "lift",
  "settings-menu": "tilt",
  settings: "tilt",
  backup: "inspect",
} as const satisfies Readonly<Record<string, SidebarIconMotion>>;

/** New menu IDs keep the same bounded gesture without device-specific gating. */
export function getSidebarIconMotion(id: string): SidebarIconMotion {
  return Object.prototype.hasOwnProperty.call(SIDEBAR_ICON_MOTION_BY_ID, id)
    ? SIDEBAR_ICON_MOTION_BY_ID[id as keyof typeof SIDEBAR_ICON_MOTION_BY_ID]
    : "lift";
}
