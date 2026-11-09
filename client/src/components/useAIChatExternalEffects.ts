import { useEffect, type RefObject } from "react";
import { useAIMessageFollow } from "@/hooks/useAIMessageFollow";
import { useAIContext } from "@/context/AIContext";

import {
  AI_CANCEL_EVENT,
  AI_RESET_EVENT,
  type AIChatStatus,
} from "@/lib/ai-chat";

type UseAIChatExternalEffectsOptions = {
  aiStatus: AIChatStatus;
  cancelAISearch: (incrementSession?: boolean) => void;
  messages: readonly unknown[];
  messagesRef: RefObject<HTMLDivElement | null>;
  onCancelAISearchReady?: ((cancelFn: () => void) => void) | undefined;
  onStatusChange?: ((status: AIChatStatus) => void) | undefined;
  resetSession: () => void;
  streamingText: string;
  isVisible?: boolean | undefined;
};

export function useAIChatExternalEffects({
  aiStatus,
  cancelAISearch,
  messages,
  messagesRef,
  onCancelAISearchReady,
  onStatusChange,
  resetSession,
  streamingText,
  isVisible = true,
}: UseAIChatExternalEffectsOptions) {
  const { floatingReadingBookmark } = useAIContext();
  const messageFollow = useAIMessageFollow({
    containerRef: messagesRef, messages, streamingText, activityKey: aiStatus,
    readingBookmark: floatingReadingBookmark, isVisible,
  });
  useEffect(() => {
    onCancelAISearchReady?.(() => cancelAISearch(true));
    return () => {
      onCancelAISearchReady?.(() => undefined);
    };
  }, [cancelAISearch, onCancelAISearchReady]);

  useEffect(() => {
    onStatusChange?.(aiStatus);
  }, [aiStatus, onStatusChange]);

  useEffect(() => {
    const onReset = () => {
      resetSession();
    };
    const onCancel = () => {
      cancelAISearch(true);
    };

    window.addEventListener(AI_RESET_EVENT, onReset);
    window.addEventListener(AI_CANCEL_EVENT, onCancel);

    return () => {
      window.removeEventListener(AI_RESET_EVENT, onReset);
      window.removeEventListener(AI_CANCEL_EVENT, onCancel);
      cancelAISearch(true);
    };
  }, [cancelAISearch, resetSession]);
  return messageFollow;
}
