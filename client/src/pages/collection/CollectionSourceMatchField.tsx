import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CollectionMatchingErrorKind, CollectionMatchingStatus } from "./collection-source-matching-policy";

type CollectionSourceMatchFieldProps = {
  disabled: boolean;
  status: CollectionMatchingStatus;
  error: string;
  errorKind: CollectionMatchingErrorKind | null;
  canRetry: boolean;
  onRetry: () => void;
};

function getMatchingMessage({ status, error, errorKind, canRetry }: CollectionSourceMatchFieldProps) {
  switch (status) {
    case "incomplete":
      return "Lengkapkan identiti, Account/Card, Payment Date, dan Amount untuk padanan automatik.";
    case "waiting":
      return "Menunggu input selesai sebelum menyemak padanan...";
    case "checking":
      return "Sedang menyemak padanan Saved...";
    case "paused":
      return "Auto-matching dijeda buat sementara waktu.";
    case "matched":
      return "Padanan Saved ditemui.";
    case "no-match":
      return "Tiada rekod Saved sepadan. Semak semula identiti, Account/Card Number, Payment Date, dan Amount.";
    case "error":
      switch (errorKind) {
        case "no-config":
          return "Tiada source Saved aktif untuk Payment Date ini. Minta superuser konfigurasi source terlebih dahulu.";
        case "ambiguous":
          return "Lebih daripada satu source atau rekod sepadan. Minta superuser membetulkan padanan sebelum menyimpan.";
        case "access":
          return "Akses semakan padanan tidak dibenarkan. Semak akses akaun anda dengan pentadbir.";
        case "transient":
          return canRetry
            ? "Semakan padanan terganggu buat sementara waktu. Cuba semula."
            : "Semakan padanan terganggu buat sementara waktu. Tunggu sebentar sebelum cuba semula.";
        case "no-match":
          return "Tiada rekod Saved sepadan. Semak semula identiti, Account/Card Number, Payment Date, dan Amount.";
        default:
          return error || "Padanan tidak dapat disemak. Semak maklumat yang dimasukkan.";
      }
  }
}

export function CollectionSourceMatchField(props: CollectionSourceMatchFieldProps) {
  const { disabled, status, errorKind, canRetry, onRetry } = props;
  const showRetry = status === "error" && errorKind === "transient" && canRetry;
  const hasMatchingError = status === "error" || status === "no-match";

  return (
    <div id="save-collection-matching-feedback" className="flex min-w-0 flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div
        id="save-collection-source-match-status"
        className={cn(
          "flex min-w-0 items-start gap-2 text-xs leading-5",
          hasMatchingError ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
          status === "matched" && "text-emerald-700 dark:text-emerald-300",
        )}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {status === "checking" ? (
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : hasMatchingError ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        ) : status === "matched" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        ) : null}
        <p className="min-w-0 break-words [overflow-wrap:anywhere]">{getMatchingMessage(props)}</p>
      </div>
      {showRetry ? (
        <Button
          id="save-collection-source-match-retry"
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={disabled}
          aria-describedby="save-collection-source-match-status"
          className="min-h-11 w-full shrink-0 sm:min-h-11 sm:w-auto"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Cuba semula
        </Button>
      ) : null}
    </div>
  );
}
