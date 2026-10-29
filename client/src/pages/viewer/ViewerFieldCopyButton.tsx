import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTimers } from "@/hooks/useTimers";

interface ViewerFieldCopyButtonProps {
  header: string;
  value: string;
  disabled: boolean;
}

type CopyStatus = "idle" | "pending" | "copied" | "failed";

/** Copies only this displayed field after an explicit user action. */
export const ViewerFieldCopyButton = memo(function ViewerFieldCopyButton({ header, value, disabled }: ViewerFieldCopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const statusId = useId();
  const mountedRef = useRef(false);
  const pendingRef = useRef(false);
  const requestIdRef = useRef(0);
  const { clearAllTimers, setManagedTimeout } = useTimers();

  useEffect(() => {
    mountedRef.current = true;
    pendingRef.current = false;
    setStatus("idle");
    return () => {
      mountedRef.current = false;
      pendingRef.current = false;
      requestIdRef.current += 1;
      clearAllTimers();
    };
  }, [header, value, disabled, clearAllTimers]);

  const handleCopy = useCallback(async () => {
    if (disabled || pendingRef.current || !mountedRef.current) return;
    pendingRef.current = true;
    clearAllTimers();
    const requestId = ++requestIdRef.current;
    const isCurrent = () => mountedRef.current && requestId === requestIdRef.current;
    setStatus("pending");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      if (!isCurrent()) return;
      setStatus("copied");
      setManagedTimeout(() => {
        if (isCurrent()) setStatus("idle");
      }, 2000);
    } catch {
      if (isCurrent()) setStatus("failed");
    } finally {
      if (isCurrent()) pendingRef.current = false;
    }
  }, [disabled, value, clearAllTimers, setManagedTimeout]);

  const feedback = status === "copied" ? "Disalin"
    : status === "failed" ? "Gagal menyalin. Pilih dan salin nilai secara manual."
      : status === "pending" ? "Menyalin…" : "";

  return (
    <div className="contents">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11 w-20 shrink-0 gap-1.5 px-2 text-xs sm:min-h-9"
        aria-label={`Salin ${header}`}
        aria-describedby={status !== "idle" ? statusId : undefined}
        aria-busy={status === "pending" ? true : undefined}
        disabled={disabled || status === "pending"}
        onClick={() => { void handleCopy(); }}
      >
        {status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span aria-hidden="true">{status === "copied" ? "Disalin" : "Salin"}</span>
      </Button>
      <p id={statusId} role="status" aria-live="polite" aria-atomic="true"
        className={status === "failed" ? "col-span-2 break-words text-xs leading-5 text-destructive [overflow-wrap:anywhere]" : "sr-only"}>
        {feedback}
      </p>
    </div>
  );
});
