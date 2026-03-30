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
};

export function shouldTrackFloatingAiDom({
  isOpen,
  isThinking,
  aiStatus,
}: FloatingAiDomTrackingInput) {
  if (isOpen) return true;
  if (isThinking) return true;
  return aiStatus !== "IDLE";
}
