import { Brain, PencilLine, Search, type LucideIcon } from "lucide-react";

import {
  AI_REQUEST_MAX_CHARACTERS,
  isAiRequestTextTooLong,
  normalizeAiRequestTextInput,
} from "@shared/ai-limits";
import type { AIChatMessage, AIChatMessageInput } from "@/context/AIContext";
import type { AIChatStatus } from "@/lib/ai-chat";
import { createClientRandomId } from "@/lib/secure-id";
import { sanitizeUntrustedErrorMessage } from "@/lib/safe-error-message";
import { safeJsonParseResult, type SafeJsonParseOptions } from "@/lib/utils/safe-json";

export const MAX_AI_CHAT_MESSAGES = 30;
export const AI_CHAT_MAX_RETRIES = 6;
export const AI_CHAT_RETRY_MS = 2500;
export const DEFAULT_AI_CHAT_ERROR_MESSAGE = "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.";
export { AI_REQUEST_MAX_CHARACTERS };
export const AI_CHAT_CHARACTER_LIMIT_NOTICE = `Had maksimum soalan AI ialah ${AI_REQUEST_MAX_CHARACTERS} aksara.`;

type AIChatResponseLike = {
  headers: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
};

type AIChatSuccessPayload = {
  ai_explanation?: string | undefined;
  processing?: boolean | undefined;
};

export type AIChatStatusMeta = {
  icon: LucideIcon;
  text: string;
};

export class AIChatRequestError extends Error {
  gateNotice: string | null;

  constructor(message: string, options?: { gateNotice?: string | null }) {
    super(message);
    this.name = "AIChatRequestError";
    this.gateNotice = options?.gateNotice ?? null;
  }
}

const AI_CHAT_RESPONSE_JSON_LIMITS: SafeJsonParseOptions = {
  maxDepth: 12,
  maxNodes: 1_000,
  maxRawLength: 64_000,
  maxStringLength: 20_000,
};

function looksLikeHtmlDocument(value: string) {
  return /<!doctype html|<html[\s>]|<body[\s>]|<head[\s>]/i.test(value);
}

function normalizePlainTextErrorMessage(raw: string, fallbackMessage: string) {
  if (looksLikeHtmlDocument(raw)) {
    return fallbackMessage;
  }
  const normalized = sanitizeUntrustedErrorMessage(raw, fallbackMessage);
  if (!normalized || looksLikeHtmlDocument(normalized)) {
    return fallbackMessage;
  }
  return normalized;
}

async function readAIChatJsonPayload(response: Pick<AIChatResponseLike, "text">) {
  const raw = await response.text();
  const parsed = safeJsonParseResult<unknown>(raw || "{}", AI_CHAT_RESPONSE_JSON_LIMITS);
  if (!parsed.ok) {
    throw new AIChatRequestError(DEFAULT_AI_CHAT_ERROR_MESSAGE);
  }
  return parsed.data;
}

function normalizeAIChatSuccessPayload(payload: unknown): AIChatSuccessPayload {
  const record = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  const next: AIChatSuccessPayload = {};
  if (typeof record.ai_explanation === "string") {
    next.ai_explanation = record.ai_explanation;
  }
  if (typeof record.processing === "boolean") {
    next.processing = record.processing;
  }
  return next;
}

export function getAIChatTypingDelayMs(isLowSpecMode: boolean) {
  return isLowSpecMode ? 18 : 14;
}

export function normalizeAIChatQueryInput(value: string): string {
  return normalizeAiRequestTextInput(value);
}

export function isAIChatQueryOverLimit(value: string): boolean {
  return isAiRequestTextTooLong(value);
}

export function getAIChatRemainingCharacterCount(value: string): number {
  return Math.max(0, AI_REQUEST_MAX_CHARACTERS - value.length);
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
  const message = typeof record.message === "string"
    ? sanitizeUntrustedErrorMessage(record.message, fallbackMessage)
    : "";
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

export async function readAIChatErrorResponse(
  response: AIChatResponseLike,
  fallbackMessage = DEFAULT_AI_CHAT_ERROR_MESSAGE,
) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return new AIChatRequestError(
      normalizePlainTextErrorMessage(await response.text(), fallbackMessage),
    );
  }

  try {
    const payload = await readAIChatJsonPayload(response);
    const details = getAIChatErrorDetailsFromPayload(payload, fallbackMessage);
    return new AIChatRequestError(details.message, { gateNotice: details.gateNotice });
  } catch {
    return new AIChatRequestError(fallbackMessage);
  }
}

export async function readAIChatSuccessPayload(
  response: Pick<AIChatResponseLike, "text">,
  fallbackMessage = DEFAULT_AI_CHAT_ERROR_MESSAGE,
) {
  try {
    return normalizeAIChatSuccessPayload(await readAIChatJsonPayload(response));
  } catch {
    throw new AIChatRequestError(fallbackMessage);
  }
}
