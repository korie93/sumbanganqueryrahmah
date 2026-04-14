import type { AIChatMessageInput } from "@/context/AIContext";
import { DEFAULT_AI_CHAT_ERROR_MESSAGE } from "@/components/ai-chat-utils";
import { logClientError } from "@/lib/client-logger";

type HandleUnexpectedAIChatSendErrorParams = {
  error: unknown;
  sessionId: number | null;
  canApplyUiUpdate: (sessionId: number) => boolean;
  appendMessage: (message: AIChatMessageInput) => void;
  finishAsyncCycle: (options?: {
    clearStreamingText?: boolean;
    gateNotice?: string | null;
  }) => void;
};

export function handleUnexpectedAIChatSendError({
  error,
  sessionId,
  canApplyUiUpdate,
  appendMessage,
  finishAsyncCycle,
}: HandleUnexpectedAIChatSendErrorParams): void {
  logClientError("AI chat send failed unexpectedly", error, {
    feature: "floating-ai",
    sessionId,
  });

  if (sessionId === null || !canApplyUiUpdate(sessionId)) {
    return;
  }

  try {
    appendMessage({
      role: "assistant",
      content: DEFAULT_AI_CHAT_ERROR_MESSAGE,
      timestamp: new Date().toISOString(),
    });
  } catch (appendError) {
    logClientError("AI chat unexpected send failure could not append fallback message", appendError, {
      feature: "floating-ai",
      sessionId,
    });
  }

  finishAsyncCycle({
    clearStreamingText: true,
    gateNotice: null,
  });
}
