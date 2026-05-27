import {
  useCallback,
  useMemo,
  useReducer,
  useRef,
  type SetStateAction,
} from "react";

import { type AIChatMessageInput, useAIContext } from "@/context/AIContext";
import { type AIChatStatus } from "@/lib/ai-chat";

import {
  AI_CHAT_CHARACTER_LIMIT_NOTICE,
  appendAIChatMessage,
  getAIChatStatusMeta,
  getAIChatTypingDelayMs,
  isAIChatQueryOverLimit,
  normalizeAIChatQueryInput,
} from "./ai-chat-utils";
import { useAIChatExternalEffects } from "./useAIChatExternalEffects";
import { useAIChatRequestExecutor } from "./useAIChatRequestExecutor";
import { useAIChatRuntimeRefs } from "./useAIChatRuntimeRefs";
import { useAIChatTypingAction } from "./useAIChatTypingAction";

type UseAIChatStateOptions = {
  aiEnabled: boolean;
  isMobile: boolean;
  timeoutMs: number;
  onCancelAISearchReady?: ((cancelFn: () => void) => void) | undefined;
  onStatusChange?: ((status: AIChatStatus) => void) | undefined;
};

type AIChatLocalState = {
  aiStatus: AIChatStatus;
  gateNotice: string | null;
  isProcessing: boolean;
  isTyping: boolean;
  query: string;
  slowNotice: boolean;
  streamingText: string;
};

type AIChatLocalStateAction =
  | { type: "setAiStatus"; value: SetStateAction<AIChatStatus> }
  | { type: "setGateNotice"; value: SetStateAction<string | null> }
  | { type: "setIsProcessing"; value: SetStateAction<boolean> }
  | { type: "setIsTyping"; value: SetStateAction<boolean> }
  | { type: "setQuery"; value: SetStateAction<string> }
  | { type: "setSlowNotice"; value: SetStateAction<boolean> }
  | { type: "setStreamingText"; value: SetStateAction<string> };

const AI_CHAT_INITIAL_LOCAL_STATE: AIChatLocalState = {
  aiStatus: "IDLE",
  gateNotice: null,
  isProcessing: false,
  isTyping: false,
  query: "",
  slowNotice: false,
  streamingText: "",
};

function resolveStateActionValue<T>(previous: T, value: SetStateAction<T>): T {
  return typeof value === "function"
    ? (value as (current: T) => T)(previous)
    : value;
}

function aiChatLocalStateReducer(
  state: AIChatLocalState,
  action: AIChatLocalStateAction,
): AIChatLocalState {
  switch (action.type) {
    case "setAiStatus":
      return { ...state, aiStatus: resolveStateActionValue(state.aiStatus, action.value) };
    case "setGateNotice":
      return { ...state, gateNotice: resolveStateActionValue(state.gateNotice, action.value) };
    case "setIsProcessing":
      return { ...state, isProcessing: resolveStateActionValue(state.isProcessing, action.value) };
    case "setIsTyping":
      return { ...state, isTyping: resolveStateActionValue(state.isTyping, action.value) };
    case "setQuery":
      return { ...state, query: resolveStateActionValue(state.query, action.value) };
    case "setSlowNotice":
      return { ...state, slowNotice: resolveStateActionValue(state.slowNotice, action.value) };
    case "setStreamingText":
      return { ...state, streamingText: resolveStateActionValue(state.streamingText, action.value) };
    default:
      return state;
  }
}

export function useAIChatState({
  aiEnabled,
  isMobile,
  timeoutMs,
  onCancelAISearchReady,
  onStatusChange,
}: UseAIChatStateOptions) {
  const { messages, setMessages, setIsThinking } = useAIContext();

  const isLowSpecMode =
    typeof document !== "undefined"
    && document.documentElement.classList.contains("low-spec");
  const typingDelayMs = getAIChatTypingDelayMs(isLowSpecMode);

  const [localState, dispatchLocalState] = useReducer(
    aiChatLocalStateReducer,
    AI_CHAT_INITIAL_LOCAL_STATE,
  );
  const {
    aiStatus,
    gateNotice,
    isProcessing,
    isTyping,
    query,
    slowNotice,
    streamingText,
  } = localState;
  const setAiStatus = useCallback((value: SetStateAction<AIChatStatus>) => {
    dispatchLocalState({ type: "setAiStatus", value });
  }, []);
  const setGateNotice = useCallback((value: SetStateAction<string | null>) => {
    dispatchLocalState({ type: "setGateNotice", value });
  }, []);
  const setIsProcessing = useCallback((value: SetStateAction<boolean>) => {
    dispatchLocalState({ type: "setIsProcessing", value });
  }, []);
  const setIsTyping = useCallback((value: SetStateAction<boolean>) => {
    dispatchLocalState({ type: "setIsTyping", value });
  }, []);
  const setQuery = useCallback((value: SetStateAction<string>) => {
    dispatchLocalState({ type: "setQuery", value });
  }, []);
  const setSlowNotice = useCallback((value: SetStateAction<boolean>) => {
    dispatchLocalState({ type: "setSlowNotice", value });
  }, []);
  const setStreamingText = useCallback((value: SetStateAction<string>) => {
    dispatchLocalState({ type: "setStreamingText", value });
  }, []);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    abortActiveRequest,
    clearRetryTimers,
    clearRequestTimeout,
    clearSlowNoticeTimer,
    isMountedRef,
    processingRef,
    registerRetryTimer,
    requestControllerRef,
    requestTimeoutRef,
    sessionRef,
    slowNoticeTimerRef,
    stopTyping,
    typingIntervalRef,
    unregisterRetryTimer,
  } = useAIChatRuntimeRefs({ setIsTyping });

  const appendMessage = useCallback((message: AIChatMessageInput) => {
    setMessages((prev) => appendAIChatMessage(prev, message));
  }, [setMessages]);

  const cancelAISearch = useCallback((incrementSession = true) => {
    if (incrementSession) {
      sessionRef.current += 1;
    }

    abortActiveRequest("cancelled");
    clearRetryTimers();
    clearRequestTimeout();
    clearSlowNoticeTimer();
    stopTyping();

    if (isMountedRef.current) {
      setStreamingText("");
      setSlowNotice(false);
      setGateNotice(null);
    }

    processingRef.current = false;
    if (isMountedRef.current) {
      setIsProcessing(false);
      setIsThinking(false);
      setAiStatus("IDLE");
    }
  }, [
    abortActiveRequest,
    clearRequestTimeout,
    clearRetryTimers,
    clearSlowNoticeTimer,
    isMountedRef,
    processingRef,
    sessionRef,
    setIsThinking,
    stopTyping,
  ]);

  const updateQuery = useCallback((value: string) => {
    const normalized = normalizeAIChatQueryInput(value);
    setQuery(normalized);
    if (value.length > normalized.length) {
      setGateNotice(AI_CHAT_CHARACTER_LIMIT_NOTICE);
      return;
    }
    if (gateNotice === AI_CHAT_CHARACTER_LIMIT_NOTICE) {
      setGateNotice(null);
    }
  }, [gateNotice]);

  const resetSession = useCallback(() => {
    cancelAISearch(true);
    setMessages([]);
    setQuery("");
  }, [cancelAISearch, setMessages]);

  const startTyping = useAIChatTypingAction({
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
  });

  const startSlowNoticeWatch = useCallback((sessionId: number) => {
    clearSlowNoticeTimer();
    slowNoticeTimerRef.current = window.setTimeout(() => {
      if (
        sessionId !== sessionRef.current
        || !isMountedRef.current
        || !processingRef.current
      ) {
        return;
      }
      setSlowNotice(true);
    }, 1500);
  }, [clearSlowNoticeTimer, isMountedRef, processingRef, sessionRef, slowNoticeTimerRef]);

  const executeSearch = useAIChatRequestExecutor({
    abortActiveRequest,
    appendMessage,
    clearRequestTimeout,
    clearSlowNoticeTimer,
    isMountedRef,
    processingRef,
    registerRetryTimer,
    requestControllerRef,
    requestTimeoutRef,
    sessionRef,
    setAiStatus,
    setGateNotice,
    setIsProcessing,
    setIsThinking,
    setSlowNotice,
    setStreamingText,
    startTyping,
    timeoutMs,
    unregisterRetryTimer,
  });

  const handleSend = useCallback(async () => {
    if (!aiEnabled) {
      return;
    }
    const trimmed = query.trim();
    if (!trimmed || processingRef.current) {
      return;
    }
    if (isAIChatQueryOverLimit(query)) {
      setGateNotice(AI_CHAT_CHARACTER_LIMIT_NOTICE);
      return;
    }

    cancelAISearch(false);
    sessionRef.current += 1;
    const sessionId = sessionRef.current;

    setQuery("");
    setGateNotice(null);
    setSlowNotice(false);
    setAiStatus("SEARCHING");
    processingRef.current = true;
    setIsProcessing(true);
    setIsThinking(true);
    setIsTyping(false);

    appendMessage({
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    });

    if (isMobile) {
      textareaRef.current?.blur();
    }

    startSlowNoticeWatch(sessionId);
    await executeSearch(trimmed, sessionId, 0);
  }, [
    aiEnabled,
    appendMessage,
    cancelAISearch,
    executeSearch,
    isMobile,
    processingRef,
    query,
    setIsThinking,
    sessionRef,
    startSlowNoticeWatch,
  ]);

  useAIChatExternalEffects({
    aiStatus,
    cancelAISearch,
    messages,
    messagesRef,
    onCancelAISearchReady,
    onStatusChange,
    resetSession,
    streamingText,
  });

  const statusMeta = useMemo(() => getAIChatStatusMeta(aiStatus), [aiStatus]);

  return {
    aiStatus,
    cancelAISearch,
    gateNotice,
    handleSend,
    isProcessing,
    isTyping,
    messages,
    messagesRef,
    query,
    setQuery: updateQuery,
    showActions: isProcessing || isTyping,
    slowNotice,
    statusMeta,
    streamingText,
    textareaRef,
  };
}
