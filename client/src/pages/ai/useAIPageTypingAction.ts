import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { AIChatMessageInput } from "@/context/AIContext";
import type { AIChatStatus } from "@/lib/ai-chat";
import type { AIPageRuntimeRefs } from "./useAIPageRuntimeRefs";
import { AI_RESPONSE_REVEAL_TICK_MS, getAIResponseRevealIndex, prefersReducedAIResponseMotion } from "@/lib/ai-response-reveal";

type UseAIPageTypingActionOptions = {
  appendMessage: (message: AIChatMessageInput) => void;
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
      if (!isMountedRef.current || sessionRef.current !== sessionId) return;
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
      const startedAt = performance.now();
      const finish = () => {
        if (!isMountedRef.current || sessionRef.current !== sessionId) return;
        stopTyping();
        setStreamingText("");
        appendMessage({ role: "assistant", content: text, timestamp: new Date().toISOString() });
        stopProcessingState();
      };
      if (prefersReducedAIResponseMotion()) { finish(); return; }
      const timerId = window.setInterval(() => {
        if (typingTimerRef.current !== timerId || !isMountedRef.current || sessionRef.current !== sessionId) {
          window.clearInterval(timerId);
          if (typingTimerRef.current === timerId) { typingTimerRef.current = null; stopTyping(); }
          return;
        }
        const nextIndex = getAIResponseRevealIndex(text, performance.now() - startedAt, typingIntervalMs);
        if (prefersReducedAIResponseMotion() || nextIndex >= text.length) { finish(); return; }
        if (nextIndex !== index) { index = nextIndex; setStreamingText(text.slice(0, index)); }
      }, AI_RESPONSE_REVEAL_TICK_MS);
      typingTimerRef.current = timerId;
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
