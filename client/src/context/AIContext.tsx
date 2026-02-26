import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

export type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type AIContextValue = {
  messages: AIChatMessage[];
  isThinking: boolean;
  unreadCount: number;
  setMessages: Dispatch<SetStateAction<AIChatMessage[]>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setUnreadCount: Dispatch<SetStateAction<number>>;
  resetSession: () => void;
};

const AIContext = createContext<AIContextValue | null>(null);

type AIProviderProps = {
  children: ReactNode;
};

export function AIProvider({ children }: AIProviderProps) {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const resetSession = () => {
    setMessages([]);
    setUnreadCount(0);
  };

  const value = useMemo(
    () => ({
      messages,
      isThinking,
      unreadCount,
      setMessages,
      setIsThinking,
      setUnreadCount,
      resetSession,
    }),
    [isThinking, messages, unreadCount],
  );

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAIContext() {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error("useAIContext must be used within AIProvider");
  }
  return context;
}
