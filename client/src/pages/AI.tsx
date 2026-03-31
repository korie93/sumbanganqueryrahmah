import { AIConversationCard } from "@/pages/ai/AIConversationCard";
import { useAIPageController } from "@/pages/ai/useAIPageController";

type AIProps = {
  timeoutMs?: number;
  aiEnabled?: boolean;
  embedded?: boolean;
  showResetButton?: boolean;
};

export default function AI({
  timeoutMs = 20000,
  aiEnabled = true,
  embedded = false,
  showResetButton = true,
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

  const chatPanel = (
    <AIConversationCard
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
      onQueryChange={controller.setQuery}
      onSend={() => {
        void controller.handleSend();
      }}
      onCancel={controller.cancelAI}
      onReset={controller.resetChat}
    />
  );

  if (embedded) {
    return chatPanel;
  }

  return (
    <div className="app-shell-min-height bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-6 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-foreground">AI Chat</h1>
          <p className="text-muted-foreground">
            Tanya biasa je tak power macam ChatGPT. Jangan tanya yang bukan-bukan.
          </p>
        </div>
        {chatPanel}
      </div>
    </div>
  );
}
