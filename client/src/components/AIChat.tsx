import { Loader2, StopCircle, SendHorizonal, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import AIMessage from "@/components/AIMessage";
import { type AIChatStatus as SharedAIChatStatus } from "@/lib/ai-chat";
import "@/styles/ai.css";
import { useAIChatState } from "@/components/useAIChatState";

type AIChatProps = {
  timeoutMs: number;
  aiEnabled: boolean;
  compactMode?: boolean;
  onCancelAISearchReady?: (cancelFn: () => void) => void;
  onStatusChange?: (status: AIChatStatus) => void;
};

export type AIChatStatus = SharedAIChatStatus;

export default function AIChat({
  timeoutMs,
  aiEnabled,
  compactMode = false,
  onCancelAISearchReady,
  onStatusChange,
}: AIChatProps) {
  const isMobile = useIsMobile();
  const {
    aiStatus,
    cancelAISearch,
    gateNotice,
    handleSend,
    isProcessing,
    isTyping,
    messages,
    messagesRef,
    query,
    setQuery,
    showActions,
    slowNotice,
    statusMeta,
    streamingText,
    textareaRef,
  } = useAIChatState({
    aiEnabled,
    isMobile,
    onCancelAISearchReady,
    onStatusChange,
    timeoutMs,
  });

  return (
    <div className="ai-chat-container" data-compact={compactMode ? "true" : "false"}>
      <div className="ai-status-bar">
        <statusMeta.icon className="ai-status-icon" />
        <span>{statusMeta.text}</span>
      </div>

      {slowNotice ? (
        <div className="ai-notice">
          <p className="ai-notice-title">Sistem sedang memproses data.</p>
          <p>Ini mungkin mengambil masa sedikit pada komputer spesifikasi rendah.</p>
        </div>
      ) : null}
      {gateNotice ? (
        <div className="ai-notice">{gateNotice}</div>
      ) : null}

      <div ref={messagesRef} className="ai-messages">
        {messages.length === 0 ? (
          <div className="ai-empty-hint">
            Taip soalan seperti IC, nombor akaun, atau nama untuk bantuan pantas.
          </div>
        ) : null}

        {messages.map((msg) => (
          <AIMessage
            key={msg.id ?? `${msg.timestamp}-${msg.role}-${msg.content.slice(0, 80)}`}
            role={msg.role}
            content={msg.content}
          />
        ))}

        {(aiStatus === "SEARCHING" || aiStatus === "PROCESSING") ? (
          <div className="ai-message-row ai-message-row-assistant">
            <div
              className="ai-bubble ai-bubble-assistant ai-typing-bubble"
              role="status"
              aria-label="AI sedang berfikir"
              aria-live="polite"
            >
              <Loader2 className="ai-typing-spinner" />
              <span className="ai-typing-label">AI sedang menaip...</span>
              <span className="ai-typing-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        ) : null}

        {isTyping && streamingText ? (
          <AIMessage role="assistant" content={streamingText} />
        ) : null}
      </div>

      <div className="ai-input-container">
        <Textarea
          ref={textareaRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={compactMode ? "Taip soalan ringkas..." : "Taip soalan anda..."}
          className="ai-input"
          rows={compactMode ? 1 : 2}
          disabled={!aiEnabled || isProcessing}
        />
        <Button
          type="button"
          onClick={handleSend}
          className="ai-send-btn"
          disabled={!aiEnabled || isProcessing || !query.trim()}
          aria-label="Send AI query"
        >
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>

      {showActions ? (
        <div className="ai-actions">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ai-stop-btn"
            onClick={() => cancelAISearch(true)}
            disabled={!isProcessing && !isTyping}
          >
            <StopCircle className="h-4 w-4" />
            <span>Stop AI</span>
          </Button>
        </div>
      ) : null}

      {!aiEnabled ? (
        <div className="ai-notice ai-notice-error">
          <TriangleAlert className="h-4 w-4" />
          <span>AI assistant is disabled by system settings.</span>
        </div>
      ) : null}
    </div>
  );
}
