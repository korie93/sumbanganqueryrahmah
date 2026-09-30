import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { AuthV17Layout } from "@/components/auth/AuthV17Layout";
import { useAuthLocale } from "@/components/auth/useAuthLocale";
import { requestPasswordReset } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api-errors";
import { localizeAuthFeedback } from "@/lib/auth-flow-feedback";
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
  const { locale, t } = useAuthLocale();
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

  const handleIdentifierBlur = () => {
    const fieldErrors = validateIdentifierField(identifier);
    setIdentifierError(fieldErrors.identifier ?? "");
  };

  const identifierInvalidProps = identifierError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "forgot-password-identifier-error",
    }
    : {};
  const layoutBackProps = onBackToHome ? { onBackClick: onBackToHome } : {};

  return (
    <AuthV17Layout
      badge={t("auth.v17Recovery.forgotBadge")}
      title={t("auth.v17Recovery.forgotTitle")}
      description={t("auth.v17Recovery.forgotDescription")}
      icon={<LifeBuoy className="h-7 w-7" aria-hidden="true" focusable="false" />}
      visualMode="minimal"
      contentBusy={loading}
      {...layoutBackProps}
    >
      {submitted ? (
        <div className="public-auth-status-card public-auth-status-card--success" role="status" aria-live="polite">
          {t("auth.v17Recovery.forgotSuccess")}
        </div>
      ) : (
        <form noValidate className="auth-v17-form" onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}>
          <div className="space-y-2">
            <label htmlFor="forgot-password-identifier" className="public-auth-field-label">
              {t("auth.v17Recovery.identifier")}
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
              onBlur={handleIdentifierBlur}
              placeholder={t("auth.v17Recovery.identifier")}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={loading}
              {...identifierInvalidProps}
            />
            {identifierError ? (
              <p id="forgot-password-identifier-error" className="public-auth-field-error" role="alert">
                {localizeAuthFeedback(identifierError, locale)}
              </p>
            ) : null}
          </div>
          <div className="public-auth-note">
            {t("auth.v17Recovery.forgotNote")}
          </div>
          {error ? (
            <div className="public-auth-status-card public-auth-status-card--error" role="alert">
              {localizeAuthFeedback(error, locale)}
            </div>
          ) : null}
          <PublicAuthButton
            type="submit"
            disabled={loading}
          >
            {t(loading ? "auth.v17Recovery.sending" : "auth.v17Recovery.sendRequest")}
          </PublicAuthButton>
        </form>
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
        {t("auth.v17Recovery.backToLogin")}
      </PublicAuthButton>
    </AuthV17Layout>
  );
}
