import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { AIChatMessage } from "@/context/AIContext";
import type { AIChatStatus } from "@/lib/ai-chat";
import type { AIPageRuntimeRefs } from "./useAIPageRuntimeRefs";

type UseAIPageTypingActionOptions = {
  appendMessage: (message: AIChatMessage) => void;
  runtimeRefs: Pick<AIPageRuntimeRefs, "isMountedRef" | "sessionRef" | "stopTyping" | "typingTimerRef">;
  setAiStatus: Dispatch<SetStateAction<AIChatStatus>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setIsTyping: Dispatch<SetStateAction<boolean>>;
  setStreamingText: Dispatch<SetStateAction<string>>;
  setStreamingTimestamp: Dispatch<SetStateAction<string>>;
  stopProcessingState: () => void;
  typingIntervalMs: number;
};

export function useAIPageTypingAction({
  appendMessage,
  runtimeRefs,
  setAiStatus,
  setIsThinking,
  setIsTyping,
  setStreamingText,
  setStreamingTimestamp,
  stopProcessingState,
  typingIntervalMs,
}: UseAIPageTypingActionOptions) {
  const { isMountedRef, sessionRef, stopTyping, typingTimerRef } = runtimeRefs;

  return useCallback(
    (text: string, sessionId: number) => {
      stopTyping();
      setStreamingText("");
      setStreamingTimestamp(new Date().toISOString());

      if (!text.trim()) {
        appendMessage({
          role: "assistant",
          content: "Tiada cadangan AI.",
          timestamp: new Date().toISOString(),
        });
        stopProcessingState();
        return;
      }

      setIsTyping(true);
      setAiStatus("TYPING");
      setIsThinking(true);
      let index = 0;

      typingTimerRef.current = window.setInterval(() => {
        if (!isMountedRef.current || sessionRef.current !== sessionId) {
          stopTyping();
          return;
        }

        index += 1;
        setStreamingText(text.slice(0, index));

        if (index >= text.length) {
          stopTyping();
          if (!isMountedRef.current || sessionRef.current !== sessionId) return;
          setStreamingText("");
          appendMessage({
            role: "assistant",
            content: text,
            timestamp: new Date().toISOString(),
          });
          stopProcessingState();
        }
      }, typingIntervalMs);
    },
    [
      appendMessage,
      isMountedRef,
      sessionRef,
      setAiStatus,
      setIsThinking,
      setIsTyping,
      setStreamingText,
      setStreamingTimestamp,
      stopProcessingState,
      stopTyping,
      typingIntervalMs,
      typingTimerRef,
    ],
  );
}
