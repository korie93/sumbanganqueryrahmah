import { useEffect, useRef, useState } from "react";
import { normalizeToastRequestId } from "@/components/ui/toast-request-reference";
import { useAuthLocale } from "./useAuthLocale";
import "./PublicAuthRequestReference.css";

type Props = { requestId: string | null };
type CopyState = "idle" | "copying" | "copied" | "failed";

function RequestReferenceContent({ requestId }: { requestId: string }) {
  const { locale } = useAuthLocale();
  const english = locale === "en";
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const mountedRef = useRef(true);
  const copyingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleCopy = async () => {
    if (copyingRef.current) return;
    copyingRef.current = true;
    setCopyState("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(requestId);
      if (mountedRef.current) setCopyState("copied");
    } catch {
      if (mountedRef.current) setCopyState("failed");
    } finally {
      copyingRef.current = false;
    }
  };

  const message = copyState === "copied"
    ? english ? "Reference ID copied." : "Kod rujukan disalin."
    : copyState === "failed"
      ? english ? "Unable to copy the reference ID. Select and copy this code manually."
        : "Kod rujukan tidak dapat disalin. Pilih dan salin kod ini secara manual."
      : "";

  return (
    <div className="public-auth-request-reference">
      <span className="public-auth-request-reference__details">
        <span>{english ? "Reference ID" : "Kod rujukan"}</span>
        <code className="public-auth-request-reference__value">{requestId}</code>
      </span>
      <button
        type="button"
        className="public-auth-request-reference__copy"
        disabled={copyState === "copying"}
        aria-label={english ? "Copy reference ID" : "Salin kod rujukan"}
        onClick={() => { void handleCopy(); }}
      >
        {copyState === "copying" ? english ? "Copying…" : "Menyalin…"
          : copyState === "copied" ? english ? "Copied" : "Disalin"
            : english ? "Copy" : "Salin"}
      </button>
      <p className="public-auth-request-reference__status" role="status" aria-live="polite" aria-atomic="true">{message}</p>
    </div>
  );
}

/** Explicitly copies only the validated support reference, never error details. */
export function PublicAuthRequestReference({ requestId }: Props) {
  const normalized = typeof requestId === "string" ? normalizeToastRequestId(requestId) : null;
  return normalized ? <RequestReferenceContent key={normalized} requestId={normalized} /> : null;
}
