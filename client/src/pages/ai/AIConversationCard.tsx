import { useId, useRef, type RefObject } from "react";
import { AIMessageContent } from "@/components/AIMessage";
import { AIJumpToLatestButton } from "@/components/AIJumpToLatestButton";
import { AIIconTooltip } from "@/components/AIIconTooltip";
import { AIChatStatusAnnouncement, getAIChatStatusAnnouncement } from "@/components/AIChatStatusAnnouncement";
import { RotateCcw, SendHorizonal, Square, SquarePen } from "lucide-react";
import { handleAIQueryKeyDown } from "@/components/ai-query-keyboard";
import {
  AI_PROCESSING_INDICATOR_DELAY_MS,
  AILoadingSkeleton,
} from "@/components/AILoadingSkeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AIChatMessage } from "@/context/AIContext";
import type { AIChatStatus } from "@/lib/ai-chat";
import { useDelayedVisibleFlag } from "@/components/useDelayedVisibleFlag";
import { useAutoGrowTextarea } from "@/hooks/useAutoGrowTextarea";
import { AIQueryLimit } from "@/components/AIQueryLimit";
import { AIResetConfirmation, useAIResetConfirmation } from "@/components/AIResetConfirmation";
import type { AIPageStatusContent } from "@/pages/ai/ai-page-controller-utils";
import {
  AI_REQUEST_MAX_CHARACTERS,
} from "@/components/ai-chat-utils";

interface AIConversationCardProps {
  assistantLabel: string;
  aiEnabled: boolean;
  embedded: boolean;
  showResetButton: boolean;
  messages: AIChatMessage[];
  isThinking: boolean;
  query: string;
  aiStatus: AIChatStatus;
  gateNotice: string | null;
  slowNotice: boolean;
  streamingText: string;
  streamingTimestamp: string;
  isProcessing: boolean;
  isTyping: boolean;
  statusContent: AIPageStatusContent;
  messagesContainerRef: RefObject<HTMLDivElement>;
  onQueryChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onReset: () => void;
  retryAvailable?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  showJumpToLatest?: boolean | undefined;
  onJumpToLatest?: (() => void) | undefined;
}

export function AIConversationCard({
  assistantLabel,
  aiEnabled,
  embedded,
  showResetButton,
  messages,
  isThinking,
  query,
  aiStatus,
  gateNotice,
  slowNotice,
  streamingText,
  streamingTimestamp,
  isProcessing,
  isTyping,
  statusContent,
  messagesContainerRef,
  onQueryChange,
  onSend,
  onCancel,
  onReset,
  retryAvailable = false,
  onRetry,
  showJumpToLatest = false,
  onJumpToLatest,
}: AIConversationCardProps) {
  const messagesId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sendButtonRef = useRef<HTMLButtonElement | null>(null);
  useAutoGrowTextarea(textareaRef, query, { minRows: 1, maxRows: 5 });
  const chatHeightClass = embedded
    ? "h-full max-h-[350px]"
    : "ai-page-message-log";
  const canStop = isProcessing || isTyping;
  const canSend = aiEnabled && !canStop && Boolean(query.trim());
  const hasDraft = Boolean(query.trim());
  const canReset = messages.length > 0 || canStop || hasDraft;
  const reset = useAIResetConfirmation({ hasDraft, isActive: canStop, onReset, fallbackFocusRef: textareaRef });
  const awaitingFirstToken = isThinking && streamingText.length === 0;
  const showProcessingIndicator = useDelayedVisibleFlag(
    awaitingFirstToken,
    AI_PROCESSING_INDICATOR_DELAY_MS,
  );
  const feedbackText = getAIChatStatusAnnouncement({ enabled: aiEnabled, status: aiStatus, gateNotice, slowNotice, retryAvailable });
  const feedbackIsNotice = Boolean(gateNotice || retryAvailable || (slowNotice && (aiStatus === "SEARCHING" || aiStatus === "PROCESSING")));
  const chatControls = showResetButton && canReset ? (
    <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
      <AIIconTooltip label="Sembang Baharu">
        <Button type="button" variant="outline" className="h-11 w-11 p-0" onClick={reset.requestReset} disabled={!canReset}
          aria-label="Sembang Baharu">
          <SquarePen className="h-4 w-4" aria-hidden="true" />
        </Button>
      </AIIconTooltip>
    </div>
  ) : null;

  return (
    <div className="ai-conversation-card rounded-2xl border border-border bg-card p-3 sm:p-4">
      <AIChatStatusAnnouncement enabled={aiEnabled} status={aiStatus} gateNotice={gateNotice} slowNotice={slowNotice} retryAvailable={retryAvailable} />
      <div className="ai-conversation-content space-y-3">
        {!aiEnabled ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            Pembantu AI dinyahaktifkan oleh tetapan sistem.
          </div>
        ) : null}

        {feedbackText || chatControls ? (
          <div className="ai-conversation-toolbar flex items-center justify-between gap-2">
            {feedbackText ? (
              <div
                className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-xs leading-5 ${feedbackIsNotice ? "text-amber-700 dark:text-amber-300" : statusContent.className}`}
                data-ai-feedback="true"
              >
                <statusContent.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{feedbackText}</span>
              </div>
            ) : null}
            {chatControls}
          </div>
        ) : null}

        <div className="ai-message-viewport">
          <div
            ref={messagesContainerRef}
            id={messagesId}
            className={`${chatHeightClass} overflow-y-auto space-y-4 pr-2`}
            role="log"
            tabIndex={0}
            aria-live="polite"
            aria-relevant="additions text"
            aria-busy={canStop}
            aria-label={`Perbualan ${assistantLabel}`}
          >
            {messages.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Taip nama, nombor IC atau nombor akaun untuk bermula.
              </div>
            ) : null}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`ai-page-message-row ${
                  message.role === "user"
                    ? "ml-auto" : "mr-auto"
                }`}
                role="article"
                aria-label={message.role === "user" ? "Mesej pengguna" : "Mesej pembantu AI"}
              >
                <div className={`ai-page-bubble whitespace-pre-wrap rounded-2xl px-4 py-3 ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                  <AIMessageContent content={message.content} allowBold={message.role === "assistant"} />
                </div>
              </div>
            ))}

            {streamingText ? (
              <div
                key={`streaming-${streamingTimestamp}`}
                className="ai-page-bubble mr-auto whitespace-pre-wrap rounded-2xl bg-muted px-4 py-3 text-foreground"
                role="article"
                aria-label="Mesej pembantu AI"
              >
                <AIMessageContent content={streamingText} />
              </div>
            ) : null}

            {showProcessingIndicator ? (
              <AILoadingSkeleton label={`${assistantLabel} sedang menyediakan jawapan...`} />
            ) : null}
          </div>

          {onJumpToLatest ? <AIJumpToLatestButton controlsId={messagesId} visible={showJumpToLatest} onJump={onJumpToLatest} /> : null}
        </div>
        <div className="ai-composer-row flex items-end gap-2">
          <label htmlFor="ai-conversation-query" className="sr-only">
            Taip soalan kepada {assistantLabel}
          </label>
          <Textarea
            ref={textareaRef}
            id="ai-conversation-query"
            name="aiConversationQuery"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => handleAIQueryKeyDown(event, canSend, onSend)}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            placeholder="Taip mesej..."
            rows={1}
            disabled={!aiEnabled || isProcessing}
            className="ai-page-input"
            autoComplete="off"
            maxLength={AI_REQUEST_MAX_CHARACTERS}
            aria-describedby="ai-conversation-query-limit"
          />
          {aiEnabled && retryAvailable && onRetry ? (
            <AIIconTooltip label="Cuba semula soalan terakhir">
              <Button type="button" variant="outline" className="ai-retry-btn" disabled={canStop}
                aria-label="Cuba semula soalan terakhir"
                onClick={() => {
                  onRetry();
                  requestAnimationFrame(() => sendButtonRef.current?.focus({ preventScroll: true }));
                }}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </Button>
            </AIIconTooltip>
          ) : null}
          <AIIconTooltip label={canStop ? "Hentikan AI" : "Hantar (Ctrl/Cmd+Enter)"}>
            <Button ref={sendButtonRef} type="button" variant="ghost" className="ai-send-btn ai-composer-action h-11 w-11 shrink-0 p-0" onClick={canStop ? onCancel : onSend}
              data-ai-action={canStop ? "stop" : "send"}
              disabled={!canStop && !canSend} aria-label={canStop ? `Hentikan ${assistantLabel}` : "Hantar"}>
              {canStop ? <Square className="h-4 w-4 fill-current" aria-hidden="true" /> : <SendHorizonal className="ai-send-icon" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />}
            </Button>
          </AIIconTooltip>
        </div>
        <AIQueryLimit value={query} descriptionId="ai-conversation-query-limit" className="text-right text-2xs leading-snug text-muted-foreground" />
        <AIResetConfirmation {...reset} />

      </div>
    </div>
  );
}
