import type { AIChatMessageInput } from "@/context/AIContext";

type ActiveResponseRef = { current: boolean };

/** Explicit Stop keeps the committed prefix; lifecycle cancellation stays separate. */
export function stopAIChatResponse({
  appendMessage,
  cancelResponse,
  isMountedRef,
  processingRef,
  streamingText,
}: {
  appendMessage: (message: AIChatMessageInput) => void;
  cancelResponse: () => void;
  isMountedRef: ActiveResponseRef;
  processingRef: ActiveResponseRef;
  streamingText: string;
}) {
  if (!isMountedRef.current || !processingRef.current) return;
  // Claim the active response before abort listeners or another Stop can run.
  processingRef.current = false;
  cancelResponse();
  // Cancellation invalidates the session and clears callbacks before history.
  if (isMountedRef.current && streamingText.trim()) {
    appendMessage({ role: "assistant", content: streamingText, timestamp: new Date().toISOString() });
  }
}
