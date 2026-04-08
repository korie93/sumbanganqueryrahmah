import { useEffect, type RefObject } from "react";

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
}: UseAIChatExternalEffectsOptions) {
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
    const current = messagesRef.current;
    if (!current) {
      return;
    }
    current.scrollTop = current.scrollHeight;
  }, [messages, messagesRef, streamingText, aiStatus]);

  useEffect(() => {
    const onReset = () => {
      resetSession();
    };
    const onCancel = () => {
      cancelAISearch(true);
    };

    window.addEventListener(AI_RESET_EVENT, onReset as EventListener);
    window.addEventListener(AI_CANCEL_EVENT, onCancel as EventListener);

    return () => {
      window.removeEventListener(AI_RESET_EVENT, onReset as EventListener);
      window.removeEventListener(AI_CANCEL_EVENT, onCancel as EventListener);
      cancelAISearch(true);
    };
  }, [cancelAISearch, resetSession]);
}
