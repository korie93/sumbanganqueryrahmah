import { Brain, PencilLine, Search, type LucideIcon } from "lucide-react";

import type { AIChatMessage, AIChatMessageInput } from "@/context/AIContext";
import type { AIChatStatus } from "@/lib/ai-chat";
import { createClientRandomId } from "@/lib/secure-id";

export const MAX_AI_CHAT_MESSAGES = 30;
export const AI_CHAT_MAX_RETRIES = 6;
export const AI_CHAT_RETRY_MS = 2500;
export const DEFAULT_AI_CHAT_ERROR_MESSAGE = "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.";

export type AIChatStatusMeta = {
  icon: LucideIcon;
  text: string;
};

export function getAIChatTypingDelayMs(isLowSpecMode: boolean) {
  return isLowSpecMode ? 18 : 14;
}

export function appendAIChatMessage(
  messages: AIChatMessage[],
  message: AIChatMessageInput,
  maxMessages = MAX_AI_CHAT_MESSAGES,
) {
  const normalizedMessage: AIChatMessage = message.id ? {
    ...message,
    id: message.id,
  } : {
    ...message,
    id: createClientRandomId("ai-msg"),
  };
  const next = [...messages, normalizedMessage];
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

export function formatAIChatQueueBusyNotice(
  queueSize: number,
  queueLimit: number,
  waitMs: number,
) {
  return waitMs > 0
    ? `AI queue busy (${queueSize}/${queueLimit}). Estimated wait ${Math.max(1, Math.round(waitMs / 1000))}s.`
    : `AI queue busy (${queueSize}/${queueLimit}). Please retry shortly.`;
}

export function formatAIChatQueuedNotice(gateWaitMs: number) {
  return `AI request queued for ${Math.max(1, Math.round(gateWaitMs / 1000))}s due to current traffic.`;
}

export function getAIChatErrorDetailsFromPayload(
  payload: unknown,
  fallbackMessage = DEFAULT_AI_CHAT_ERROR_MESSAGE,
) {
  const record = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const gate = record.gate && typeof record.gate === "object"
    ? record.gate as Record<string, unknown>
    : null;

  let gateNotice: string | null = null;
  if (
    gate
    && Number.isFinite(Number(gate.queueSize))
    && Number.isFinite(Number(gate.queueLimit))
  ) {
    gateNotice = formatAIChatQueueBusyNotice(
      Number(gate.queueSize),
      Number(gate.queueLimit),
      Number(gate.queueWaitMs || 0),
    );
  }

  return {
    gateNotice,
    message: message || fallbackMessage,
  };
}
