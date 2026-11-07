import { AIConversationCard } from "@/pages/ai/AIConversationCard";
import { useAIPageController } from "@/pages/ai/useAIPageController";
import "@/styles/ai.css";

type AIProps = {
  timeoutMs?: number;
  aiEnabled?: boolean;
  embedded?: boolean;
  showResetButton?: boolean;
  systemName?: string | undefined;
};

export default function AI({
  timeoutMs = 20000,
  aiEnabled = true,
  embedded = false,
  showResetButton = true,
  systemName,
}: AIProps) {
  const isLowSpecMode =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("low-spec");
  const typingIntervalMs = isLowSpecMode ? 18 : 12;
  const controller = useAIPageController({
    timeoutMs,
    aiEnabled,
    typingIntervalMs,
  });
  const assistantLabel = `AI ${systemName?.trim() || "SQR"}`;

  const chatPanel = (
    <AIConversationCard
      assistantLabel={assistantLabel}
      aiEnabled={aiEnabled}
      embedded={embedded}
      showResetButton={showResetButton}
      messages={controller.messages}
      isThinking={controller.isThinking}
      query={controller.query}
      aiStatus={controller.aiStatus}
      gateNotice={controller.gateNotice}
      slowNotice={controller.slowNotice}
      streamingText={controller.streamingText}
      streamingTimestamp={controller.streamingTimestamp}
      isProcessing={controller.isProcessing}
      isTyping={controller.isTyping}
      statusContent={controller.statusContent}
      messagesContainerRef={controller.messagesContainerRef}
      showJumpToLatest={controller.showJumpToLatest}
      onJumpToLatest={controller.jumpToLatest}
      onQueryChange={controller.setQuery}
      onSend={() => {
        void controller.handleSend();
      }}
      onCancel={controller.cancelAI}
      onReset={controller.resetChat}
      retryAvailable={controller.retryAvailable}
      onRetry={() => { void controller.retryLastQuery(); }}
    />
  );

  if (embedded) {
    return chatPanel;
  }

  return (
    <div className="ai-page-layout app-shell-min-height bg-background p-4 md:p-6">
      <div className="ai-page-workspace mx-auto max-w-4xl" data-ai-layout-notice={Boolean(controller.gateNotice || controller.slowNotice)}>
        <div className="flex flex-col gap-2">
          <h1 className="ops-page-title">AI Chat</h1>
          <p className="text-muted-foreground">
            Tanya soalan tentang koleksi dan rekod SQR.
          </p>
        </div>
        {chatPanel}
      </div>
    </div>
  );
}
