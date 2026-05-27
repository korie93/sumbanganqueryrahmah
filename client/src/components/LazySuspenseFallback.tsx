const DEFAULT_LAZY_DIALOG_FALLBACK_LABEL = "Loading dialog...";

type LazySuspenseFallbackProps = {
  label: string;
};

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

export function LazyDialogFallback({
  label = DEFAULT_LAZY_DIALOG_FALLBACK_LABEL,
}: LazyDialogFallbackProps) {
  return <LazySuspenseFallback label={label} />;
}
