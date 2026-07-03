import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import type { AIChatStatus } from "@/components/AIChat";
import { useAIContext } from "@/context/AIContext";

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
  const isMountedRef = useRef(true);
  const {
    messages,
    isThinking,
    unreadCount,
    setUnreadCount,
    resetSession,
  } = useAIContext();
  const assistantCount = useMemo(
    () => messages.reduce((count, message) => (message.role === "assistant" ? count + 1 : count), 0),
    [messages],
  );
  const lastAssistantCountRef = useRef(assistantCount);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      cancelAISearchRef.current = null;
    };
  }, []);

  const setIsOpenIfMounted = useCallback((value: SetStateAction<boolean>) => {
    if (!isMountedRef.current) {
      return;
    }

    setIsOpen(value);
  }, []);

  const setAiStatusIfMounted = useCallback((status: AIChatStatus) => {
    if (!isMountedRef.current) {
      return;
    }

    setAiStatus(status);
  }, []);

  useEffect(() => {
    setIsOpenIfMounted(false);
  }, [activePage, location, setIsOpenIfMounted]);

  useEffect(() => {
    if (isOpen && unreadCount !== 0) {
      setUnreadCount(0);
    }
  }, [isOpen, setUnreadCount, unreadCount]);

  useEffect(() => {
    const assistantCountSnapshot = assistantCount;
    const previousAssistantCount = lastAssistantCountRef.current;
    lastAssistantCountRef.current = assistantCountSnapshot;

    if (assistantCountSnapshot > previousAssistantCount && !isOpen) {
      setUnreadCount((previous) => previous + (assistantCountSnapshot - previousAssistantCount));
    }
  }, [assistantCount, isOpen, setUnreadCount]);

  const handleMinimize = useCallback(() => {
    setIsOpenIfMounted(false);
  }, [setIsOpenIfMounted]);

  const handleToggle = useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }

    setHasActivated(true);
    setIsOpenIfMounted((previous) => !previous);
  }, [setIsOpenIfMounted]);

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
    setIsOpen: setIsOpenIfMounted,
    hasActivated,
    aiStatus,
    setAiStatus: setAiStatusIfMounted,
    handleMinimize,
    handleToggle,
    handleReset,
    registerCancelAISearch: (cancelFn: (() => void) | null) => {
      cancelAISearchRef.current = cancelFn;
    },
  };
}
