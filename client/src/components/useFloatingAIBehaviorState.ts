import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AIChatStatus } from "@/components/AIChat";
import {
  useAIMessagesContext,
  useAIThinkingContext,
  useAIUnreadCountContext,
} from "@/context/AIContext";

const AI_RESET_EVENT = "ai-chat-reset";

type UseFloatingAIBehaviorStateParams = {
  activePage: string;
  location: string;
};

export function useFloatingAIBehaviorState({
  activePage,
  location,
}: UseFloatingAIBehaviorStateParams) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasActivated, setHasActivated] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIChatStatus>("IDLE");
  const cancelAISearchRef = useRef<(() => void) | null>(null);
  const { messages, resetSession } = useAIMessagesContext();
  const { isThinking } = useAIThinkingContext();
  const { unreadCount, setUnreadCount } = useAIUnreadCountContext();
  const assistantCount = useMemo(
    () => messages.reduce((count, message) => (message.role === "assistant" ? count + 1 : count), 0),
    [messages],
  );
  const lastAssistantCountRef = useRef(assistantCount);

  useEffect(() => {
    setIsOpen(false);
  }, [activePage, location]);

  useEffect(() => {
    if (isOpen && unreadCount !== 0) {
      setUnreadCount(0);
    }
  }, [isOpen, setUnreadCount, unreadCount]);

  useEffect(() => {
    const previousAssistantCount = lastAssistantCountRef.current;
    if (assistantCount > previousAssistantCount && !isOpen) {
      setUnreadCount((previous) => previous + (assistantCount - previousAssistantCount));
    }
    lastAssistantCountRef.current = assistantCount;
  }, [assistantCount, isOpen, setUnreadCount]);

  const handleMinimize = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleToggle = useCallback(() => {
    setHasActivated(true);
    setIsOpen((previous) => !previous);
  }, []);

  const handleReset = useCallback(() => {
    cancelAISearchRef.current?.();
    window.dispatchEvent(new Event(AI_RESET_EVENT));
    resetSession();
  }, [resetSession]);

  return {
    messages,
    isThinking,
    unreadCount,
    isOpen,
    setIsOpen,
    hasActivated,
    aiStatus,
    setAiStatus,
    handleMinimize,
    handleToggle,
    handleReset,
    registerCancelAISearch: (cancelFn: (() => void) | null) => {
      cancelAISearchRef.current = cancelFn;
    },
  };
}
