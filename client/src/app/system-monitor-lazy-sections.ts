import { lazyWithPreload } from "@/lib/lazy-with-preload"

export type SystemMonitorLazySection =
  | "dashboard"
  | "activity"
  | "monitor"
  | "analysis"
  | "audit"

export const DashboardMonitorSectionPage = lazyWithPreload(() => import("@/pages/Dashboard"))
export const ActivityMonitorSectionPage = lazyWithPreload(() => import("@/pages/Activity"))
export const SystemPerformanceMonitorSectionPage = lazyWithPreload(() => import("@/pages/Monitor"))
export const AnalysisMonitorSectionPage = lazyWithPreload(() => import("@/pages/Analysis"))
export const AuditLogsMonitorSectionPage = lazyWithPreload(() => import("@/pages/AuditLogs"))

export function preloadSystemMonitorSection(section: SystemMonitorLazySection) {
  switch (section) {
    case "dashboard":
      return DashboardMonitorSectionPage.preload()
    case "activity":
      return ActivityMonitorSectionPage.preload()
    case "analysis":
      return AnalysisMonitorSectionPage.preload()
    case "audit":
      return AuditLogsMonitorSectionPage.preload()
    default:
      return SystemPerformanceMonitorSectionPage.preload()
  }
}
