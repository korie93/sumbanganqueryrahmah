import { Brain, PencilLine, Search, type LucideIcon } from "lucide-react";

import type { AIChatMessage, AIChatMessageInput } from "@/context/AIContext";
import type { AIChatStatus } from "@/lib/ai-chat";
import { createClientRandomId } from "@/lib/secure-id";

export const AI_PAGE_MAX_CHAT_MESSAGES = 50;
export const AI_PAGE_RETRY_MS = 2500;
export const AI_PAGE_MAX_RETRIES = 6;

export interface AIPageStatusContent {
  icon: LucideIcon;
  text: string;
  className: string;
}

export function appendAIPageMessage(
  messages: AIChatMessage[],
  message: AIChatMessageInput,
  maxMessages = AI_PAGE_MAX_CHAT_MESSAGES,
) {
  const normalizedMessage: AIChatMessage = message.id ? {
    ...message,
    id: message.id,
  } : {
    ...message,
    id: createClientRandomId("ai-msg"),
  };
  const next = [...messages, normalizedMessage];
  if (next.length <= maxMessages) return next;
  return next.slice(next.length - maxMessages);
}

export function getAIPageStatusContent(status: AIChatStatus): AIPageStatusContent {
  if (status === "SEARCHING") {
    return {
      icon: Search,
      text: "AI sedang mencari maklumat...",
      className: "border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    };
  }
  if (status === "PROCESSING") {
    return {
      icon: Brain,
      text: "AI sedang memproses data...",
      className: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (status === "TYPING") {
    return {
      icon: PencilLine,
      text: "AI sedang menaip jawapan...",
      className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }
  return {
    icon: Search,
    text: "AI idle.",
    className: "border-border bg-muted/30 text-muted-foreground",
  };
}

export function formatAIQueueBusyNotice(queueSize: number, queueLimit: number, waitMs: number) {
  return waitMs > 0
    ? `AI queue busy (${queueSize}/${queueLimit}). Estimated wait ${Math.max(1, Math.round(waitMs / 1000))}s.`
    : `AI queue busy (${queueSize}/${queueLimit}). Please retry shortly.`;
}

export function formatAIQueuedNotice(gateWaitMs: number) {
  return `AI request queued for ${Math.max(1, Math.round(gateWaitMs / 1000))}s due to current traffic.`;
}
