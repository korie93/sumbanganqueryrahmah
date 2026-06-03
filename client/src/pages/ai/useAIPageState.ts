import {
  useCallback,
  useReducer,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  AI_CHAT_CHARACTER_LIMIT_NOTICE,
  normalizeAIChatQueryInput,
} from "@/components/ai-chat-utils";
import type { AIChatStatus } from "@/lib/ai-chat";

export type AIPageLocalState = {
  aiStatus: AIChatStatus;
  gateNotice: string | null;
  isProcessing: boolean;
  isTyping: boolean;
  query: string;
  slowNotice: boolean;
  streamingText: string;
  streamingTimestamp: string;
};

export type AIPageStateAction =
  | { type: "SET_AI_STATUS"; value: SetStateAction<AIChatStatus> }
  | { type: "SET_GATE_NOTICE"; value: SetStateAction<string | null> }
  | { type: "SET_IS_PROCESSING"; value: SetStateAction<boolean> }
  | { type: "SET_IS_TYPING"; value: SetStateAction<boolean> }
  | { type: "SET_QUERY"; value: SetStateAction<string> }
  | { type: "SET_SLOW_NOTICE"; value: SetStateAction<boolean> }
  | { type: "SET_STREAMING_TEXT"; value: SetStateAction<string> }
  | { type: "SET_STREAMING_TIMESTAMP"; value: SetStateAction<string> };

export const AI_PAGE_INITIAL_STATE: AIPageLocalState = {
  aiStatus: "IDLE",
  gateNotice: null,
  isProcessing: false,
  isTyping: false,
  query: "",
  slowNotice: false,
  streamingText: "",
  streamingTimestamp: "",
};

function resolveStateAction<T>(current: T, value: SetStateAction<T>) {
  return typeof value === "function"
    ? (value as (previous: T) => T)(current)
    : value;
}

export function aiPageStateReducer(
  state: AIPageLocalState,
  action: AIPageStateAction,
): AIPageLocalState {
  switch (action.type) {
    case "SET_AI_STATUS":
      return { ...state, aiStatus: resolveStateAction(state.aiStatus, action.value) };
    case "SET_GATE_NOTICE":
      return { ...state, gateNotice: resolveStateAction(state.gateNotice, action.value) };
    case "SET_IS_PROCESSING":
      return { ...state, isProcessing: resolveStateAction(state.isProcessing, action.value) };
    case "SET_IS_TYPING":
      return { ...state, isTyping: resolveStateAction(state.isTyping, action.value) };
    case "SET_QUERY":
      return { ...state, query: resolveStateAction(state.query, action.value) };
    case "SET_SLOW_NOTICE":
      return { ...state, slowNotice: resolveStateAction(state.slowNotice, action.value) };
    case "SET_STREAMING_TEXT":
      return { ...state, streamingText: resolveStateAction(state.streamingText, action.value) };
    case "SET_STREAMING_TIMESTAMP":
      return {
        ...state,
        streamingTimestamp: resolveStateAction(state.streamingTimestamp, action.value),
      };
    default:
      return state;
  }
}

export function useAIPageState() {
  const [state, dispatch] = useReducer(aiPageStateReducer, AI_PAGE_INITIAL_STATE);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const setRawQuery: Dispatch<SetStateAction<string>> = useCallback((value) => {
    dispatch({ type: "SET_QUERY", value });
  }, []);
  const setAiStatus: Dispatch<SetStateAction<AIChatStatus>> = useCallback((value) => {
    dispatch({ type: "SET_AI_STATUS", value });
  }, []);
  const setGateNotice: Dispatch<SetStateAction<string | null>> = useCallback((value) => {
    dispatch({ type: "SET_GATE_NOTICE", value });
  }, []);
  const setSlowNotice: Dispatch<SetStateAction<boolean>> = useCallback((value) => {
    dispatch({ type: "SET_SLOW_NOTICE", value });
  }, []);
  const setStreamingText: Dispatch<SetStateAction<string>> = useCallback((value) => {
    dispatch({ type: "SET_STREAMING_TEXT", value });
  }, []);
  const setStreamingTimestamp: Dispatch<SetStateAction<string>> = useCallback((value) => {
    dispatch({ type: "SET_STREAMING_TIMESTAMP", value });
  }, []);
  const setIsProcessing: Dispatch<SetStateAction<boolean>> = useCallback((value) => {
    dispatch({ type: "SET_IS_PROCESSING", value });
  }, []);
  const setIsTyping: Dispatch<SetStateAction<boolean>> = useCallback((value) => {
    dispatch({ type: "SET_IS_TYPING", value });
  }, []);

  const updateQuery = useCallback((value: string) => {
    const normalized = normalizeAIChatQueryInput(value);
    setRawQuery(normalized);
    if (value.length > normalized.length) {
      setGateNotice(AI_CHAT_CHARACTER_LIMIT_NOTICE);
      return;
    }
    if (state.gateNotice === AI_CHAT_CHARACTER_LIMIT_NOTICE) {
      setGateNotice(null);
    }
  }, [setGateNotice, setRawQuery, state.gateNotice]);

  return {
    ...state,
    messagesContainerRef,
    setAiStatus,
    setGateNotice,
    setIsProcessing,
    setIsTyping,
    setQuery: updateQuery,
    setRawQuery,
    setSlowNotice,
    setStreamingText,
    setStreamingTimestamp,
  };
}

export type AIPageStateController = ReturnType<typeof useAIPageState>;
