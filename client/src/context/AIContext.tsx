import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type AIChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export type AIChatMessageInput = Omit<AIChatMessage, "id"> & {
  id?: string | undefined;
};

export type AIContextValue = {
  messages: AIChatMessage[];
  isThinking: boolean;
  unreadCount: number;
  setMessages: Dispatch<SetStateAction<AIChatMessage[]>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setUnreadCount: Dispatch<SetStateAction<number>>;
  resetSession: () => void;
};

type AIMessagesContextValue = Pick<AIContextValue, "messages" | "setMessages" | "resetSession">;
type AIThinkingContextValue = Pick<AIContextValue, "isThinking" | "setIsThinking">;
type AIUnreadCountContextValue = Pick<AIContextValue, "unreadCount" | "setUnreadCount">;

const AIMessagesContext = createContext<AIMessagesContextValue | null>(null);
const AIThinkingContext = createContext<AIThinkingContextValue | null>(null);
const AIUnreadCountContext = createContext<AIUnreadCountContextValue | null>(null);

type AIProviderProps = {
  children: ReactNode;
};

export function AIProvider({ children }: AIProviderProps) {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const resetSession = useCallback(() => {
    setMessages([]);
    setUnreadCount(0);
  }, []);

  const messagesValue = useMemo(
    () => ({
      messages,
      setMessages,
      resetSession,
    }),
    [messages, resetSession],
  );
  const thinkingValue = useMemo(
    () => ({
      isThinking,
      setIsThinking,
    }),
    [isThinking],
  );
  const unreadCountValue = useMemo(
    () => ({
      unreadCount,
      setUnreadCount,
    }),
    [unreadCount],
  );

  return (
    <AIMessagesContext.Provider value={messagesValue}>
      <AIThinkingContext.Provider value={thinkingValue}>
        <AIUnreadCountContext.Provider value={unreadCountValue}>
          {children}
        </AIUnreadCountContext.Provider>
      </AIThinkingContext.Provider>
    </AIMessagesContext.Provider>
  );
}

export function useAIMessagesContext() {
  const context = useContext(AIMessagesContext);
  if (!context) {
    throw new Error("useAIMessagesContext must be used within AIProvider");
  }
  return context;
}

export function useAIThinkingContext() {
  const context = useContext(AIThinkingContext);
  if (!context) {
    throw new Error("useAIThinkingContext must be used within AIProvider");
  }
  return context;
}

export function useAIUnreadCountContext() {
  const context = useContext(AIUnreadCountContext);
  if (!context) {
    throw new Error("useAIUnreadCountContext must be used within AIProvider");
  }
  return context;
}

export function useAIContext() {
  const { messages, resetSession, setMessages } = useAIMessagesContext();
  const { isThinking, setIsThinking } = useAIThinkingContext();
  const { unreadCount, setUnreadCount } = useAIUnreadCountContext();

  return {
    messages,
    isThinking,
    unreadCount,
    setMessages,
    setIsThinking,
    setUnreadCount,
    resetSession,
  };
}
