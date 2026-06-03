const DEFAULT_LAZY_DIALOG_FALLBACK_LABEL = "Loading dialog...";

type LazySuspenseFallbackProps = {
  label: string;
};

/**
 * Renders the lazy suspense fallback loading state for deferred SQR UI.
 */
export function LazySuspenseFallback({ label }: LazySuspenseFallbackProps) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {label}
    </div>
  );
}

type LazyDialogFallbackProps = {
  label?: string;
};

/**
 * Renders the lazy dialog fallback loading state for deferred SQR UI.
 */
export function LazyDialogFallback({
  label = DEFAULT_LAZY_DIALOG_FALLBACK_LABEL,
}: LazyDialogFallbackProps) {
  return <LazySuspenseFallback label={label} />;
}
