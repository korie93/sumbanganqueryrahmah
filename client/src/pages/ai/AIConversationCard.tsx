import type { RefObject } from "react";
import { StopCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AIChatMessage } from "@/context/AIContext";
import type { AIChatStatus } from "@/lib/ai-chat";
import type { AIPageStatusContent } from "@/pages/ai/ai-page-controller-utils";
import {
  AI_REQUEST_MAX_CHARACTERS,
  getAIChatRemainingCharacterCount,
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
}: AIConversationCardProps) {
  const chatHeightClass = embedded ? "h-full max-h-[350px]" : "h-[60vh]";
  const canStop = isProcessing || isTyping;
  const canReset = messages.length > 0 || isProcessing || isTyping;
  const remainingCharacters = getAIChatRemainingCharacterCount(query);
  const showCharacterLimit = remainingCharacters <= 200;

  return (
    <div className="rounded-2xl border border-border bg-background/70 p-4 backdrop-blur">
      <div className="space-y-4">
        {!aiEnabled ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            Pembantu AI dinyahaktifkan oleh tetapan sistem.
          </div>
        ) : null}

        {aiEnabled ? (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${statusContent.className}`}
          >
            <statusContent.icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{statusContent.text}</span>
          </div>
        ) : null}

        {aiEnabled && gateNotice ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            {gateNotice}
          </div>
        ) : null}

        {aiEnabled && slowNotice ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <p className="font-medium">Sistem sedang memproses data.</p>
            <p>Ini mungkin mengambil masa sedikit pada komputer spesifikasi rendah.</p>
          </div>
        ) : null}

        {showResetButton ? (
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={!canStop}>
              <StopCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              Hentikan AI
            </Button>
            <Button type="button" variant="outline" onClick={onReset} disabled={!canReset}>
              Sembang Baharu
            </Button>
          </div>
        ) : null}

        <div ref={messagesContainerRef} className={`${chatHeightClass} overflow-y-auto space-y-3 pr-2`}>
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Mula dengan soalan seperti: <span className="font-semibold">IC 840703115667</span> atau{" "}
              <span className="font-semibold">cawangan AEON terdekat</span>
            </div>
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
                message.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto bg-muted text-foreground"
              }`}
            >
              {message.content}
            </div>
          ))}

          {streamingText ? (
            <div
              key={`streaming-${streamingTimestamp}`}
              className="mr-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-3 text-sm text-foreground"
            >
              {streamingText}
            </div>
          ) : null}

          {isThinking && !streamingText ? (
            <div
              className="mr-auto max-w-[70%] rounded-2xl bg-muted px-4 py-3 text-sm text-foreground"
              role="status"
              aria-label="AI sedang berfikir"
              aria-live="polite"
            >
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/70" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/70 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/70 [animation-delay:300ms]" />
                <span className="ml-2">AI sedang menaip...</span>
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-end gap-2">
          <label htmlFor="ai-conversation-query" className="sr-only">
            Taip soalan kepada {assistantLabel}
          </label>
          <Textarea
            id="ai-conversation-query"
            name="aiConversationQuery"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Taip soalan anda..."
            rows={2}
            disabled={!aiEnabled || isProcessing}
            className={embedded ? "min-h-[72px]" : ""}
            autoComplete="off"
            maxLength={AI_REQUEST_MAX_CHARACTERS}
            aria-describedby="ai-conversation-query-limit"
          />
          <Button type="button" onClick={onSend} disabled={!aiEnabled || isProcessing}>
            {isProcessing ? "Memproses..." : "Hantar"}
          </Button>
        </div>
        <p
          id="ai-conversation-query-limit"
          className={showCharacterLimit ? "text-right text-[11px] leading-snug text-muted-foreground" : "sr-only"}
          aria-live="polite"
        >
          Had soalan AI {AI_REQUEST_MAX_CHARACTERS} aksara. {remainingCharacters} aksara berbaki.
        </p>

        {!showResetButton ? (
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={!canStop}>
              <StopCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              Hentikan AI
            </Button>
          </div>
        ) : null}

        {aiEnabled && aiStatus === "IDLE" && gateNotice === null && slowNotice === false ? (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <p>Tip: untuk respon lebih cepat pada komputer lama, gunakan soalan ringkas dan spesifik.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
