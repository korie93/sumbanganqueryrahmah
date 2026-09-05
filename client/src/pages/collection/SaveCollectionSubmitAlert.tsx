import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveCollectionSubmitFailure } from "@/pages/collection/save-collection-submit-feedback";

type SaveCollectionSubmitAlertProps = {
  failure: SaveCollectionSubmitFailure | null;
  disabled?: boolean;
  onRetry: () => void;
  onDismiss: () => void;
  onReauthenticateNickname?: (() => void) | undefined;
};

export function SaveCollectionSubmitAlert({
  failure,
  disabled = false,
  onRetry,
  onDismiss,
  onReauthenticateNickname,
}: SaveCollectionSubmitAlertProps) {
  if (!failure) {
    return null;
  }

  return (
    <section
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{failure.title}</h3>
            {failure.receiptCount > 0 ? (
              <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs text-muted-foreground">
                {failure.receiptCount} receipt pending
              </span>
            ) : null}
          </div>
          <p className="leading-relaxed text-foreground">{failure.message}</p>
          <p className="leading-relaxed text-muted-foreground">{failure.helperText}</p>
          {failure.requestId ? (
            <p className="text-xs text-muted-foreground">Reference ID: {failure.requestId}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onDismiss}
          disabled={disabled}
          aria-label="Tutup mesej ralat simpan collection"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {failure.requiresNicknameAuthentication && onReauthenticateNickname ? (
        <div className="mt-3 flex flex-wrap gap-2 pl-8">
          <Button type="button" size="sm" onClick={onReauthenticateNickname} disabled={disabled}>
            Sahkan Nickname Semula
          </Button>
        </div>
      ) : null}
      {failure.canRetry ? (
        <div className="mt-3 flex flex-wrap gap-2 pl-8">
          <Button type="button" size="sm" onClick={onRetry} disabled={disabled}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Cuba Save Semula
          </Button>
        </div>
      ) : null}
    </section>
  );
}
