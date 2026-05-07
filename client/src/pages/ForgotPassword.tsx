import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { PublicAuthLayout } from "@/components/PublicAuthLayout";
import { requestPasswordReset } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api-errors";
import {
  hasPublicAuthFieldErrors,
  validateIdentifierField,
} from "@/pages/public-auth-form-utils";
import { isPublicAuthAbortError } from "@/pages/public-auth-runtime-utils";

type ForgotPasswordPageProps = {
  onBackToHome?: () => void;
  onBackToLogin?: () => void;
};

export default function ForgotPasswordPage({
  onBackToHome,
  onBackToLogin,
}: ForgotPasswordPageProps) {
  const [, navigate] = useLocation();
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
  const layoutBackProps = onBackToHome ? { onBackClick: onBackToHome } : {};

  return (
    <PublicAuthLayout
      badge="Pemulihan Akses"
      title="Permintaan Tetapan Semula Kata Laluan"
      description="Masukkan username atau emel anda untuk menghantar permintaan tetapan semula. Permintaan ini akan disemak oleh superuser sebelum pautan selamat dihantar kepada akaun yang berkaitan."
      icon={<LifeBuoy className="h-7 w-7" aria-hidden="true" focusable="false" />}
      visualMode="minimal"
      showBackButton={false}
      contentBusy={loading}
      {...layoutBackProps}
    >
      {submitted ? (
        <div className="public-auth-status-card public-auth-status-card--success" role="status" aria-live="polite">
          Jika akaun wujud, permintaan tetapan semula telah dihantar kepada superuser untuk semakan.
          Emel tetapan semula hanya akan dihantar selepas permintaan diluluskan.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label htmlFor="forgot-password-identifier" className="public-auth-field-label">
              Username atau emel
            </label>
            <PublicAuthInput
              id="forgot-password-identifier"
              name="identifier"
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                setIdentifierError("");
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSubmit();
                }
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
              <p id="forgot-password-identifier-error" className="public-auth-field-error" role="alert">
                {identifierError}
              </p>
            ) : null}
          </div>
          <div className="public-auth-note">
            Demi keselamatan, sistem hanya memaparkan status umum dan tidak mendedahkan sama ada
            sesuatu akaun benar-benar wujud.
          </div>
          {error ? (
            <div className="public-auth-status-card public-auth-status-card--error" role="alert">
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
          if (onBackToLogin) {
            onBackToLogin();
            return;
          }
          navigate("/");
        }}
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" />
        Kembali ke log masuk
      </PublicAuthButton>
    </PublicAuthLayout>
  );
}
