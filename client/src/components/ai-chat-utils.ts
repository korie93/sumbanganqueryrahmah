import { Brain, PencilLine, Search, type LucideIcon } from "lucide-react";

import type { AIChatMessage } from "@/context/AIContext";
import type { AIChatStatus } from "@/lib/ai-chat";

export const MAX_AI_CHAT_MESSAGES = 30;
export const AI_CHAT_MAX_RETRIES = 6;
export const AI_CHAT_RETRY_MS = 2500;

export type AIChatStatusMeta = {
  icon: LucideIcon;
  text: string;
};

export function getAIChatTypingDelayMs(isLowSpecMode: boolean) {
  return isLowSpecMode ? 18 : 14;
}

export function appendAIChatMessage(
  messages: AIChatMessage[],
  message: AIChatMessage,
  maxMessages = MAX_AI_CHAT_MESSAGES,
) {
  const next = [...messages, message];
  if (next.length <= maxMessages) {
    return next;
  }
  return next.slice(next.length - maxMessages);
}

export function getAIChatStatusMeta(status: AIChatStatus): AIChatStatusMeta {
  if (status === "SEARCHING") {
    return {
      icon: Search,
      text: "AI sedang mencari maklumat...",
    };
  }
  if (status === "PROCESSING") {
    return {
      icon: Brain,
      text: "AI sedang memproses data...",
    };
  }
  if (status === "TYPING") {
    return {
      icon: PencilLine,
      text: "AI sedang menaip jawapan...",
    };
  }
  return {
    icon: Search,
    text: "AI idle.",
  };
}
