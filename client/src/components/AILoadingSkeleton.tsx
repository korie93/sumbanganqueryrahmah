export const AI_PROCESSING_INDICATOR_DELAY_MS = 300;

type AILoadingSkeletonProps = {
  label?: string;
};

export function AILoadingSkeleton({
  label = "AI sedang menyediakan jawapan...",
}: AILoadingSkeletonProps) {
  return (
    <div className="ai-message-row ai-message-row-assistant">
      <div
        className="ai-bubble ai-bubble-assistant ai-loading-skeleton"
        role="status"
        aria-label={label}
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="sr-only">{label}</span>
        <span className="ai-loading-skeleton-lines" aria-hidden="true">
          <span className="ai-loading-skeleton-line ai-loading-skeleton-line--wide" />
          <span className="ai-loading-skeleton-line ai-loading-skeleton-line--medium" />
          <span className="ai-loading-skeleton-line ai-loading-skeleton-line--short" />
        </span>
      </div>
    </div>
  );
}
