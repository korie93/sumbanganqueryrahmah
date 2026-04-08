import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { AIChatMessageInput } from "@/context/AIContext";
import type { AIChatStatus } from "@/lib/ai-chat";

type UseAIChatTypingActionOptions = {
  appendMessage: (message: AIChatMessageInput) => void;
  clearSlowNoticeTimer: () => void;
  isMountedRef: MutableRefObject<boolean>;
  processingRef: MutableRefObject<boolean>;
  sessionRef: MutableRefObject<number>;
  setAiStatus: Dispatch<SetStateAction<AIChatStatus>>;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setIsTyping: Dispatch<SetStateAction<boolean>>;
  setSlowNotice: Dispatch<SetStateAction<boolean>>;
  setStreamingText: Dispatch<SetStateAction<string>>;
  stopTyping: () => void;
  typingDelayMs: number;
  typingIntervalRef: MutableRefObject<number | null>;
};

export function useAIChatTypingAction({
  appendMessage,
  clearSlowNoticeTimer,
  isMountedRef,
  processingRef,
  sessionRef,
  setAiStatus,
  setIsProcessing,
  setIsThinking,
  setIsTyping,
  setSlowNotice,
  setStreamingText,
  stopTyping,
  typingDelayMs,
  typingIntervalRef,
}: UseAIChatTypingActionOptions) {
  return useCallback((text: string, sessionId: number) => {
    stopTyping();
    setIsTyping(true);
    setAiStatus("TYPING");
    setStreamingText("");

    let index = 0;
    typingIntervalRef.current = window.setInterval(() => {
      if (sessionId !== sessionRef.current) {
        stopTyping();
        return;
      }

      index += 1;
      setStreamingText(text.slice(0, index));

      if (index >= text.length) {
        stopTyping();
        if (sessionId !== sessionRef.current) {
          return;
        }

        if (isMountedRef.current) {
          setStreamingText("");
        }

        appendMessage({
          role: "assistant",
          content: text,
          timestamp: new Date().toISOString(),
        });

        processingRef.current = false;
        if (isMountedRef.current) {
          setIsProcessing(false);
          setIsThinking(false);
          setAiStatus("IDLE");
          setSlowNotice(false);
        }
        clearSlowNoticeTimer();
      }
    }, typingDelayMs);
  }, [
    appendMessage,
    clearSlowNoticeTimer,
    isMountedRef,
    processingRef,
    sessionRef,
    setAiStatus,
    setIsProcessing,
    setIsThinking,
    setIsTyping,
    setSlowNotice,
    setStreamingText,
    stopTyping,
    typingDelayMs,
    typingIntervalRef,
  ]);
}
