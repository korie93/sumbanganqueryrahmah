import { useMemo } from "react";

import { useAIContext } from "@/context/AIContext";

import {
  getAIPageStatusContent,
  type AIPageStatusContent,
} from "./ai-page-controller-utils";
import { useAIPageActions } from "./useAIPageActions";
import { useAIPageLifecycleEffects } from "./useAIPageLifecycleEffects";
import { useAIPageRuntimeRefs } from "./useAIPageRuntimeRefs";
import { useAIPageState } from "./useAIPageState";

export type { AIPageStatusContent } from "./ai-page-controller-utils";

interface UseAIPageControllerOptions {
  timeoutMs: number;
  aiEnabled: boolean;
  typingIntervalMs: number;
}

export function useAIPageController({
  timeoutMs,
  aiEnabled,
  typingIntervalMs,
}: UseAIPageControllerOptions) {
  const { messages, isThinking, setIsThinking, setMessages, resetSession } = useAIContext();
  const pageState = useAIPageState();
  const runtimeRefs = useAIPageRuntimeRefs({ setIsTyping: pageState.setIsTyping });
  const actions = useAIPageActions({
    aiEnabled,
    query: pageState.query,
    resetSession,
    runtimeRefs,
    setAiStatus: pageState.setAiStatus,
    setGateNotice: pageState.setGateNotice,
    setIsProcessing: pageState.setIsProcessing,
    setIsThinking,
    setIsTyping: pageState.setIsTyping,
    setMessages,
    setQuery: pageState.setRawQuery,
    setSlowNotice: pageState.setSlowNotice,
    setStreamingText: pageState.setStreamingText,
    setStreamingTimestamp: pageState.setStreamingTimestamp,
    timeoutMs,
    typingIntervalMs,
  });

  useAIPageLifecycleEffects({
    cancelAI: actions.cancelAI,
    isMountedRef: runtimeRefs.isMountedRef,
    isThinking,
    isTyping: pageState.isTyping,
    messages,
    messagesContainerRef: pageState.messagesContainerRef,
    resetChat: actions.resetChat,
    streamingText: pageState.streamingText,
  });

  const statusContent = useMemo<AIPageStatusContent>(() => {
    return getAIPageStatusContent(pageState.aiStatus);
  }, [pageState.aiStatus]);

  return {
    messages,
    isThinking,
    query: pageState.query,
    aiStatus: pageState.aiStatus,
    gateNotice: pageState.gateNotice,
    slowNotice: pageState.slowNotice,
    streamingText: pageState.streamingText,
    streamingTimestamp: pageState.streamingTimestamp,
    isProcessing: pageState.isProcessing,
    isTyping: pageState.isTyping,
    messagesContainerRef: pageState.messagesContainerRef,
    statusContent,
    setQuery: pageState.setQuery,
    handleSend: actions.handleSend,
    cancelAI: actions.cancelAI,
    resetChat: actions.resetChat,
  };
}
