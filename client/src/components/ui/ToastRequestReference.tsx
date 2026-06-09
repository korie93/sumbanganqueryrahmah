import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { normalizeToastRequestId } from "@/components/ui/toast-request-reference";
import { logClientError } from "@/lib/client-logger";

type ToastRequestReferenceProps = {
  requestId: string;
};

/** Renders a sanitized support reference with an accessible copy action. */
export function ToastRequestReference({ requestId }: ToastRequestReferenceProps) {
  const normalizedRequestId = normalizeToastRequestId(requestId);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!normalizedRequestId || !navigator.clipboard?.writeText) {
      logClientError("[ToastRequestReference] Clipboard access is unavailable");
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedRequestId);
      setCopied(true);
    } catch (error: unknown) {
      logClientError("[ToastRequestReference] Failed to copy request ID", error);
    }
  }, [normalizedRequestId]);

  if (!normalizedRequestId) {
    return null;
  }

  return (
    <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-current/15 pt-2">
      <span className="min-w-0 flex-1 break-all font-mono text-xs opacity-80">
        Rujukan: {normalizedRequestId}
      </span>
      <button
        type="button"
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-current/25 px-2 text-xs font-semibold transition-colors hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-current focus:ring-offset-2 dark:hover:bg-white/10"
        aria-label={copied ? "Request ID telah disalin" : "Salin Request ID"}
        title={copied ? "Request ID telah disalin" : "Salin Request ID"}
        onClick={() => {
          void handleCopy();
        }}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span aria-live="polite">{copied ? "Disalin" : "Salin"}</span>
      </button>
    </div>
  );
}
