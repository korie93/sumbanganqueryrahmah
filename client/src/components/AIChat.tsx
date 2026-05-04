import { useId } from "react";
import { Loader2, StopCircle, SendHorizonal, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import AIMessage from "@/components/AIMessage";
import { type AIChatStatus as SharedAIChatStatus } from "@/lib/ai-chat";
import "@/styles/ai.css";
import { useAIChatState } from "@/components/useAIChatState";
import {
  AI_REQUEST_MAX_CHARACTERS,
  getAIChatRemainingCharacterCount,
} from "@/components/ai-chat-utils";

type AIChatProps = {
  timeoutMs: number;
  aiEnabled: boolean;
  compactMode?: boolean;
  onCancelAISearchReady?: ((cancelFn: () => void) => void) | undefined;
  onStatusChange?: ((status: AIChatStatus) => void) | undefined;
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
  const queryInputId = useId();
  const queryLimitId = useId();
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
  const remainingCharacters = getAIChatRemainingCharacterCount(query);
  const showCharacterLimit = remainingCharacters <= 200;

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
            key={msg.id}
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
        <label htmlFor={queryInputId} className="sr-only">
          Taip soalan kepada AI SQR
        </label>
        <Textarea
          ref={textareaRef}
          id={queryInputId}
          name="floatingAiQuery"
          data-floating-ai-query-input="true"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={compactMode ? "Taip soalan ringkas..." : "Taip soalan anda..."}
          className="ai-input"
          rows={compactMode ? 1 : 2}
          autoComplete="off"
          maxLength={AI_REQUEST_MAX_CHARACTERS}
          aria-describedby={queryLimitId}
          disabled={!aiEnabled || isProcessing}
        />
        <Button
          type="button"
          onClick={handleSend}
          className="ai-send-btn"
          disabled={!aiEnabled || isProcessing || !query.trim()}
          aria-label="Hantar soalan AI"
        >
          <SendHorizonal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <p
        id={queryLimitId}
        className={showCharacterLimit ? "ai-input-limit" : "sr-only"}
        aria-live="polite"
      >
        Had soalan AI {AI_REQUEST_MAX_CHARACTERS} aksara. {remainingCharacters} aksara berbaki.
      </p>

      {showActions ? (
        <div className="ai-actions">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ai-stop-btn"
            onClick={() => cancelAISearch(true)}
            disabled={!isProcessing && !isTyping}
            aria-disabled={!isProcessing && !isTyping}
          >
            <StopCircle className="h-4 w-4" aria-hidden="true" />
            <span>Hentikan AI</span>
          </Button>
        </div>
      ) : null}

      {!aiEnabled ? (
        <div className="ai-notice ai-notice-error" role="alert">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <span>Pembantu AI dinyahaktifkan oleh tetapan sistem.</span>
        </div>
      ) : null}
    </div>
  );
}
