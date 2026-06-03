import { useEffect } from "react";

import type { AIChatMessage } from "@/context/AIContext";
import { AI_CANCEL_EVENT, AI_RESET_EVENT } from "@/lib/ai-chat";

type MutableRef<T> = {
  current: T;
};

type UseAIPageLifecycleEffectsOptions = {
  cancelAI: () => void;
  isMountedRef: MutableRef<boolean>;
  isThinking: boolean;
  isTyping: boolean;
  messages: AIChatMessage[];
  messagesContainerRef: MutableRef<HTMLDivElement | null>;
  resetChat: () => void;
  streamingText: string;
};

export function useAIPageLifecycleEffects({
  cancelAI,
  isMountedRef,
  isThinking,
  isTyping,
  messages,
  messagesContainerRef,
  resetChat,
  streamingText,
}: UseAIPageLifecycleEffectsOptions) {
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      cancelAI();
    };
  }, [cancelAI, isMountedRef]);

  useEffect(() => {
    const onReset = () => {
      resetChat();
    };
    const onCancel = () => {
      cancelAI();
    };
    const controller = new AbortController();

    window.addEventListener(AI_RESET_EVENT, onReset, { signal: controller.signal });
    window.addEventListener(AI_CANCEL_EVENT, onCancel, { signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [cancelAI, resetChat]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, isThinking, isTyping, messagesContainerRef, streamingText]);
}
