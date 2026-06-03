import { useCallback, useRef, useState } from "react";

import {
  AI_CHAT_CHARACTER_LIMIT_NOTICE,
  normalizeAIChatQueryInput,
} from "@/components/ai-chat-utils";
import type { AIChatStatus } from "@/lib/ai-chat";

export function useAIPageState() {
  const [query, setRawQuery] = useState("");
  const [aiStatus, setAiStatus] = useState<AIChatStatus>("IDLE");
  const [gateNotice, setGateNotice] = useState<string | null>(null);
  const [slowNotice, setSlowNotice] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingTimestamp, setStreamingTimestamp] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const updateQuery = useCallback((value: string) => {
    const normalized = normalizeAIChatQueryInput(value);
    setRawQuery(normalized);
    if (value.length > normalized.length) {
      setGateNotice(AI_CHAT_CHARACTER_LIMIT_NOTICE);
      return;
    }
    if (gateNotice === AI_CHAT_CHARACTER_LIMIT_NOTICE) {
      setGateNotice(null);
    }
  }, [gateNotice]);

  return {
    aiStatus,
    gateNotice,
    isProcessing,
    isTyping,
    messagesContainerRef,
    query,
    setAiStatus,
    setGateNotice,
    setIsProcessing,
    setIsTyping,
    setQuery: updateQuery,
    setRawQuery,
    setSlowNotice,
    setStreamingText,
    setStreamingTimestamp,
    slowNotice,
    streamingText,
    streamingTimestamp,
  };
}

export type AIPageStateController = ReturnType<typeof useAIPageState>;
