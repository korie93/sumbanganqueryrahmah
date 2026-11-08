import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import type { AIChatStatus } from "@/components/AIChat";
import { countNewAIChatAssistantMessages, getAIChatAssistantMessageIds } from "@/components/ai-chat-unread";
import { useAIContext } from "@/context/AIContext";

const AI_RESET_EVENT = "ai-chat-reset";

type UseFloatingAIBehaviorStateParams = {
  activePage: string;
  location: string;
  initiallyOpen?: boolean | undefined;
};

export function useFloatingAIBehaviorState({
  activePage,
  location,
  initiallyOpen = false,
}: UseFloatingAIBehaviorStateParams) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [hasActivated, setHasActivated] = useState(initiallyOpen);
  const [aiStatus, setAiStatus] = useState<AIChatStatus>("IDLE");
  const cancelAISearchRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const previousRouteRef = useRef({ activePage, location });
  const {
    messages,
    isThinking,
    unreadCount,
    setUnreadCount,
    resetSession,
  } = useAIContext();
  const assistantMessageIds = useMemo(
    () => getAIChatAssistantMessageIds(messages),
    [messages],
  );
  const lastAssistantMessageIdsRef = useRef(assistantMessageIds);

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
    const previousRoute = previousRouteRef.current;
    if (previousRoute.activePage === activePage && previousRoute.location === location) {
      return;
    }

    previousRouteRef.current = { activePage, location };
    setIsOpenIfMounted(false);
  }, [activePage, location, setIsOpenIfMounted]);

  useEffect(() => {
    if (isOpen && unreadCount !== 0) {
      setUnreadCount(0);
    }
  }, [isOpen, setUnreadCount, unreadCount]);

  useEffect(() => {
    const assistantMessageIdsSnapshot = assistantMessageIds;
    const previousAssistantMessageIds = lastAssistantMessageIdsRef.current;
    lastAssistantMessageIdsRef.current = assistantMessageIdsSnapshot;
    const newAssistantMessages = countNewAIChatAssistantMessages(assistantMessageIdsSnapshot, previousAssistantMessageIds);

    if (newAssistantMessages > 0 && !isOpen) {
      setUnreadCount((previous) => previous + newAssistantMessages);
    }
  }, [assistantMessageIds, isOpen, setUnreadCount]);

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
