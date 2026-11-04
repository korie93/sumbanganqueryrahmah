import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { AIChatMessageInput } from "@/context/AIContext";
import type { AIChatStatus } from "@/lib/ai-chat";
import { useTimers } from "@/hooks/useTimers";
import { canApplyAIChatUiUpdate } from "@/components/ai-chat-session-guards";
import { AI_RESPONSE_REVEAL_TICK_MS, getAIResponseRevealIndex, prefersReducedAIResponseMotion } from "@/lib/ai-response-reveal";

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
  const { clearManagedInterval, setManagedInterval } = useTimers();

  const clearTypingInterval = useCallback(() => {
    if (typingIntervalRef.current !== null) {
      clearManagedInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  }, [clearManagedInterval, typingIntervalRef]);

  return useCallback((text: string, sessionId: number) => {
    if (!canApplyAIChatUiUpdate(sessionId, sessionRef, isMountedRef)) {
      return;
    }

    clearTypingInterval();
    stopTyping();
    setIsTyping(true);
    setAiStatus("TYPING");
    setStreamingText("");

    let index = 0;
    const startedAt = performance.now();
    const finish = () => {
      if (!canApplyAIChatUiUpdate(sessionId, sessionRef, isMountedRef)) return;
      clearTypingInterval();
      stopTyping();
      setStreamingText("");
      appendMessage({ role: "assistant", content: text, timestamp: new Date().toISOString() });
      setIsProcessing(false);
      setIsThinking(false);
      setAiStatus("IDLE");
      setSlowNotice(false);
      processingRef.current = false;
      clearSlowNoticeTimer();
    };
    if (!text.length || prefersReducedAIResponseMotion()) {
      finish();
      return;
    }
    const timerId = setManagedInterval(() => {
      if (typingIntervalRef.current !== timerId || !canApplyAIChatUiUpdate(sessionId, sessionRef, isMountedRef)) {
        clearManagedInterval(timerId);
        if (typingIntervalRef.current === timerId) {
          typingIntervalRef.current = null;
          stopTyping();
        }
        return;
      }
      const nextIndex = getAIResponseRevealIndex(text, performance.now() - startedAt, typingDelayMs);
      if (prefersReducedAIResponseMotion() || nextIndex >= text.length) { finish(); return; }
      if (nextIndex !== index) { index = nextIndex; setStreamingText(text.slice(0, index)); }
    }, AI_RESPONSE_REVEAL_TICK_MS);
    typingIntervalRef.current = timerId;
  }, [
    appendMessage,
    clearSlowNoticeTimer,
    clearManagedInterval,
    clearTypingInterval,
    isMountedRef,
    processingRef,
    sessionRef,
    setAiStatus,
    setIsProcessing,
    setIsThinking,
    setIsTyping,
    setSlowNotice,
    setStreamingText,
    setManagedInterval,
    stopTyping,
    typingDelayMs,
    typingIntervalRef,
  ]);
}
