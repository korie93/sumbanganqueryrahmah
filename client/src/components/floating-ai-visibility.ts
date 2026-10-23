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

export function shouldTrackFloatingAiDom({
  isOpen,
  isThinking,
  aiStatus,
  saveCollectionRoute = false,
  savedMobileRoute = false,
}: FloatingAiDomTrackingInput) {
  if (saveCollectionRoute || savedMobileRoute) return true;
  if (isOpen) return true;
  if (isThinking) return true;
  return aiStatus !== "IDLE";
}
