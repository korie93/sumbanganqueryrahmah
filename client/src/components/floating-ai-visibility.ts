import type { AIChatStatus } from "@/lib/ai-chat";

type FloatingAiPanelMountInput = {
  hasActivated: boolean;
  isOpen: boolean;
  isThinking: boolean;
  aiStatus: AIChatStatus;
};

export function shouldKeepFloatingAiPanelMounted({
  hasActivated,
  isOpen,
  isThinking,
  aiStatus,
}: FloatingAiPanelMountInput) {
  if (!hasActivated) return false;
  if (isOpen) return true;
  if (isThinking) return true;
  return aiStatus !== "IDLE";
}

type FloatingAiDomTrackingInput = {
  isOpen: boolean;
  isThinking: boolean;
  aiStatus: AIChatStatus;
  saveCollectionRoute?: boolean;
  savedMobileRoute?: boolean;
  guardedWorkspaceRoute?: boolean;
};

export function isFloatingAiSaveCollectionRoute(activePage: string, location: string) {
  if (activePage !== "collection-report") return false;
  const pathname = location.split(/[?#]/, 1)[0]?.replace(/\/+$/, "").toLowerCase();
  return pathname === "/collection/save" || pathname === "/collection" || pathname === "/collection-report";
}

export function isFloatingAiSavedMobileRoute(activePage: string, location: string, isMobile: boolean) {
  if (!isMobile || activePage !== "saved") return false;
  const pathname = location.split(/[?#]/, 1)[0]?.replace(/\/+$/, "").toLowerCase();
  return pathname === "/saved";
}

/** Keep idle observation limited to workspaces with confirmed obscured controls. */
export function isFloatingAiGuardedWorkspaceRoute(activePage: string, location: string, search = "") {
  const pathname = location.split(/[?#]/, 1)[0]?.replace(/\/+$/, "").toLowerCase() || "/";
  if (activePage === "home") return pathname === "/";
  if (activePage === "import") return pathname === "/import";
  if (activePage === "forbidden") return pathname === "/403";
  if (activePage === "collection-report") {
    return pathname === "/collection/summary"
      || pathname === "/collection/billing-principal"
      || pathname === "/collection/nickname-summary";
  }
  if (!["monitor", "dashboard", "activity"].includes(activePage)) return false;
  if (pathname === "/dashboard" || pathname === "/activity") return true;
  if (pathname !== "/monitor") return false;
  const query = location.includes("?") ? location.split("?")[1]?.split("#")[0] : search;
  const section = new URLSearchParams(query).get("section");
  return section === "dashboard" || section === "activity";
}

export function shouldTrackFloatingAiDom({
  isOpen,
  isThinking,
  aiStatus,
  saveCollectionRoute = false,
  savedMobileRoute = false,
  guardedWorkspaceRoute = false,
}: FloatingAiDomTrackingInput) {
  if (saveCollectionRoute || savedMobileRoute || guardedWorkspaceRoute) return true;
  if (isOpen) return true;
  if (isThinking) return true;
  return aiStatus !== "IDLE";
}
