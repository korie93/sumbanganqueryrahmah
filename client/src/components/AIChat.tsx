import { useId } from "react";
import { Square, SendHorizonal, TriangleAlert } from "lucide-react";
import { handleAIQueryKeyDown } from "@/components/ai-query-keyboard";
import {
  AI_PROCESSING_INDICATOR_DELAY_MS,
  AILoadingSkeleton,
} from "@/components/AILoadingSkeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import AIMessage from "@/components/AIMessage";
import { AIJumpToLatestButton } from "@/components/AIJumpToLatestButton";
import { type AIChatStatus as SharedAIChatStatus } from "@/lib/ai-chat";
import "@/styles/ai.css";
import { useDelayedVisibleFlag } from "@/components/useDelayedVisibleFlag";
import { useAIChatState } from "@/components/useAIChatState";
import {
  AI_REQUEST_MAX_CHARACTERS,
  getAIChatRemainingCharacterCount,
} from "@/components/ai-chat-utils";

type AIChatProps = {
  timeoutMs: number;
  aiEnabled: boolean;
  assistantLabel?: string;
  compactMode?: boolean;
  onCancelAISearchReady?: ((cancelFn: () => void) => void) | undefined;
  onStatusChange?: ((status: AIChatStatus) => void) | undefined;
};

export type AIChatStatus = SharedAIChatStatus;

/**
 * Renders the shared ai chat component used across SQR screens.
 */
export default function AIChat({
  timeoutMs,
  aiEnabled,
  assistantLabel = "AI SQR",
  compactMode = false,
  onCancelAISearchReady,
  onStatusChange,
}: AIChatProps) {
  const isMobile = useIsMobile();
  const queryInputId = useId();
  const queryLimitId = useId();
  const messagesId = useId();
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
    slowNotice,
    statusMeta,
    streamingText,
    textareaRef,
    jumpToLatest,
    showJumpToLatest,
  } = useAIChatState({
    aiEnabled,
    isMobile,
    onCancelAISearchReady,
    onStatusChange,
    timeoutMs,
  });
  const remainingCharacters = getAIChatRemainingCharacterCount(query);
  const showCharacterLimit = remainingCharacters <= 200;
  const canStop = isProcessing || isTyping;
  const canSend = aiEnabled && !canStop && Boolean(query.trim());
  const awaitingFirstToken =
    (aiStatus === "SEARCHING" || aiStatus === "PROCESSING") && streamingText.length === 0;
  const showProcessingIndicator = useDelayedVisibleFlag(
    awaitingFirstToken,
    AI_PROCESSING_INDICATOR_DELAY_MS,
  );

  return (
    <div className="ai-chat-container" data-compact={compactMode ? "true" : "false"}>
      {aiStatus !== "IDLE" ? <div className="ai-status-bar">
        <statusMeta.icon className="ai-status-icon" aria-hidden="true" />
        <span role="status" aria-live="polite" aria-atomic="true">
          {statusMeta.text}
        </span>
      </div> : null}

      {slowNotice ? (
        <div className="ai-notice" role="status" aria-live="polite" aria-atomic="true">
          <p className="ai-notice-title">Sistem sedang memproses data.</p>
          <p>Jawapan mengambil masa lebih lama daripada biasa.</p>
        </div>
      ) : null}
      {gateNotice ? (
        <div className="ai-notice" role="status" aria-live="polite" aria-atomic="true">
          {gateNotice}
        </div>
      ) : null}

      <div
        ref={messagesRef}
        id={messagesId}
        className="ai-messages"
        role="log"
        tabIndex={0}
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        aria-label={`Perbualan ${assistantLabel}`}
      >
        {messages.length === 0 ? (
          <div className="ai-empty-hint">
            Taip nama, nombor IC atau nombor akaun untuk bermula.
          </div>
        ) : null}

        {messages.map((msg) => (
          <AIMessage
            key={msg.id}
            messageRole={msg.role}
            content={msg.content}
          />
        ))}

        {showProcessingIndicator ? (
          <AILoadingSkeleton label={`${assistantLabel} sedang menyediakan jawapan...`} />
        ) : null}

        {isTyping && streamingText ? (
          <AIMessage messageRole="assistant" content={streamingText} />
        ) : null}
      </div>

      <AIJumpToLatestButton controlsId={messagesId} visible={showJumpToLatest} onJump={jumpToLatest} className="px-3 pb-2" />
      <div className="ai-input-container">
        <label htmlFor={queryInputId} className="sr-only">
          Taip soalan kepada {assistantLabel}
        </label>
        <Textarea
          ref={textareaRef}
          id={queryInputId}
          name="floatingAiQuery"
          data-floating-ai-query-input="true"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => handleAIQueryKeyDown(event, canSend, handleSend)}
          aria-keyshortcuts="Control+Enter Meta+Enter"
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
          onClick={canStop ? () => cancelAISearch(true) : handleSend}
          className="ai-send-btn"
          disabled={!canStop && !canSend}
          aria-label={canStop ? `Hentikan ${assistantLabel}` : "Hantar soalan AI"}
          title={canStop ? "Hentikan AI" : "Hantar soalan AI (Ctrl/Cmd+Enter)"}
        >
          {canStop ? <Square className="h-4 w-4 fill-current" aria-hidden="true" /> : <SendHorizonal className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
      <p
        id={queryLimitId}
        className={showCharacterLimit ? "ai-input-limit" : "sr-only"}
        aria-live="polite"
        aria-atomic="true"
      >
        Had soalan AI {AI_REQUEST_MAX_CHARACTERS} aksara. {remainingCharacters} aksara berbaki.
      </p>

      {!aiEnabled ? (
        <div className="ai-notice ai-notice-error" role="alert">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <span>Pembantu AI dinyahaktifkan oleh tetapan sistem.</span>
        </div>
      ) : null}
    </div>
  );
}
