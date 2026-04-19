import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { PublicAuthLayout } from "@/components/PublicAuthLayout";
import { requestPasswordReset } from "@/lib/api/auth-recovery-api";
import { getApiErrorMessage } from "@/lib/api-errors";
import {
  hasPublicAuthFieldErrors,
  validateIdentifierField,
} from "@/pages/public-auth-form-utils";
import { isPublicAuthAbortError } from "@/pages/public-auth-runtime-utils";

type ForgotPasswordPageProps = {
  onNavigateLogin?: (() => void) | undefined;
};

export default function ForgotPasswordPage({ onNavigateLogin }: ForgotPasswordPageProps) {
  const [identifier, setIdentifier] = useState("");
  const [identifierError, setIdentifierError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const mountedRef = useRef(true);
  const requestAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestAbortControllerRef.current?.abort();
      requestAbortControllerRef.current = null;
    };
  }, []);

  const handleSubmit = async () => {
    if (loading || requestAbortControllerRef.current) {
      return;
    }

    setError("");
    setIdentifierError("");

    try {
      const fieldErrors = validateIdentifierField(identifier);
      if (hasPublicAuthFieldErrors(fieldErrors)) {
        setIdentifierError(fieldErrors.identifier ?? "");
        return;
      }

      setLoading(true);
      const controller = new AbortController();
      requestAbortControllerRef.current = controller;

      await requestPasswordReset({ identifier: identifier.trim() }, { signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }
      setSubmitted(true);
    } catch (submitError) {
      if (isPublicAuthAbortError(submitError) || !mountedRef.current) {
        return;
      }
      setError(getApiErrorMessage(submitError, "Permintaan tetapan semula gagal dihantar."));
    } finally {
      requestAbortControllerRef.current = null;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const identifierInvalidProps = identifierError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "forgot-password-identifier-error",
    }
    : {};

  return (
    <PublicAuthLayout
      badge="Pemulihan Akses"
      title="Permintaan Tetapan Semula Kata Laluan"
      description="Masukkan username atau emel anda untuk menghantar permintaan tetapan semula. Permintaan ini akan disemak oleh superuser sebelum pautan selamat dihantar kepada akaun yang berkaitan."
      icon={<LifeBuoy className="h-7 w-7" />}
      contentBusy={loading}
    >
      {submitted ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-100" role="status" aria-live="polite">
          Jika akaun wujud, permintaan tetapan semula telah dihantar untuk semakan.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <PublicAuthInput
              id="forgot-password-identifier"
              name="identifier"
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                setIdentifierError("");
                setError("");
              }}
              placeholder="Username atau emel"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={loading}
              {...identifierInvalidProps}
            />
            {identifierError ? (
              <p id="forgot-password-identifier-error" className="text-sm text-amber-100" role="alert">
                {identifierError}
              </p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/75">
            Demi keselamatan, sistem hanya memaparkan status umum dan tidak mendedahkan sama ada
            sesuatu akaun benar-benar wujud.
          </div>
          {error ? (
            <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100" role="alert">
              {error}
            </div>
          ) : null}
          <PublicAuthButton
            onClick={() => void handleSubmit()}
            disabled={loading}
          >
            {loading ? "Sedang menghantar..." : "Hantar Permintaan"}
          </PublicAuthButton>
        </>
      )}

      <PublicAuthButton
        type="button"
        variant="ghost"
        onClick={() => {
          if (onNavigateLogin) {
            onNavigateLogin();
            return;
          }
          window.location.href = "/login";
        }}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Kembali ke log masuk
      </PublicAuthButton>
    </PublicAuthLayout>
  );
}
