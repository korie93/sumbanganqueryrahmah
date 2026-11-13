import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { AuthV17Layout } from "@/components/auth/AuthV17Layout";
import { AuthLink } from "@/components/auth/AuthLink";
import { AuthError } from "@/components/auth/AuthError";
import { PublicAuthRequestReference } from "@/components/auth/PublicAuthRequestReference";
import { useAuthLocale } from "@/components/auth/useAuthLocale";
import { requestPasswordReset } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api-errors";
import { localizeAuthFeedback } from "@/lib/auth-flow-feedback";
import {
  hasPublicAuthFieldErrors,
  validateIdentifierField,
} from "@/pages/public-auth-form-utils";
import { isPublicAuthAbortError, isTemporaryPublicAuthRequestError } from "@/pages/public-auth-runtime-utils";
import { beginPublicAuthActionFocus } from "@/pages/public-auth-action-focus";
import { getPublicAuthRequestReference } from "@/pages/public-auth-request-reference";

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
  const [showRetryHint, setShowRetryHint] = useState(false);
  const [requestReference, setRequestReference] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [invalidFocusRequest, setInvalidFocusRequest] = useState<{ field: "identifier" } | null>(null);
  const mountedRef = useRef(true);
  const identifierInputRef = useRef<HTMLInputElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actionFocusRef = useRef<ReturnType<typeof beginPublicAuthActionFocus> | null>(null);
  const focusIdentifierAfterEditRef = useRef(false);
  const requestAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      actionFocusRef.current?.cancel();
      requestAbortControllerRef.current?.abort();
      requestAbortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (submitted) {
      actionFocusRef.current?.complete(headingRef.current);
      actionFocusRef.current = null;
    }
    if (!submitted && focusIdentifierAfterEditRef.current) {
      focusIdentifierAfterEditRef.current = false;
      identifierInputRef.current?.focus({ preventScroll: true });
    }
  }, [submitted]);

  useEffect(() => {
    if (!invalidFocusRequest || loading) return;
    setInvalidFocusRequest(null);
    if (submitted) return;
    actionFocusRef.current?.complete(identifierInputRef.current, { revealIfNeeded: true });
    actionFocusRef.current = null;
  }, [invalidFocusRequest, loading, submitted]);

  const handleSubmit = async () => {
    if (loading || requestAbortControllerRef.current) {
      return;
    }

    setError("");
    setShowRetryHint(false);
    setRequestReference(null);
    setIdentifierError("");
    setInvalidFocusRequest(null);
    actionFocusRef.current?.cancel();
    actionFocusRef.current = beginPublicAuthActionFocus();

    try {
      const fieldErrors = validateIdentifierField(identifier);
      if (hasPublicAuthFieldErrors(fieldErrors)) {
        setIdentifierError(fieldErrors.identifier ?? "");
        setInvalidFocusRequest({ field: "identifier" });
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
      actionFocusRef.current?.cancel();
      actionFocusRef.current = null;
      if (isPublicAuthAbortError(submitError) || !mountedRef.current) {
        return;
      }
      setError(getApiErrorMessage(submitError, "Permintaan tetapan semula gagal dihantar."));
      setShowRetryHint(isTemporaryPublicAuthRequestError(submitError));
      setRequestReference(getPublicAuthRequestReference(submitError));
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
      className="auth-v17-forgot"
      badge={t("auth.v17Recovery.forgotBadge")}
      title={t(submitted ? "auth.v17Recovery.forgotSubmittedTitle" : "auth.v17Recovery.forgotTitle")}
      description={t(submitted ? "auth.v17Recovery.forgotSubmittedDescription" : "auth.v17Recovery.forgotDescription")}
      visualMode="minimal"
      recoveryArtwork
      contentBusy={loading}
      headingRef={headingRef}
      contentKey={submitted ? "confirmation" : "request"}
      persistentActions={<AuthLink
        to="/login"
        className={`public-auth-button public-auth-button-${submitted ? "primary" : "ghost"}`}
        onNavigate={() => {
          if (onBackToLogin) {
            onBackToLogin();
            return;
          }
          navigate("/");
        }}
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" />
        {t("auth.v17Recovery.backToLogin")}
      </AuthLink>}
      {...layoutBackProps}
    >
      {submitted ? (
        <>
          <div className="public-auth-status-card public-auth-status-card--success" role="status" aria-live="polite">
            {t("auth.v17Recovery.forgotSuccess")}
          </div>
          <PublicAuthButton
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={() => {
              setIdentifierError("");
              setError("");
              setShowRetryHint(false);
              setRequestReference(null);
              focusIdentifierAfterEditRef.current = true;
              setSubmitted(false);
            }}
          >
            {t("auth.v17Recovery.useDifferentIdentifier")}
          </PublicAuthButton>
        </>
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
              ref={identifierInputRef}
              id="forgot-password-identifier"
              name="identifier"
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                setIdentifierError("");
                setError("");
                setShowRetryHint(false);
                setRequestReference(null);
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
            <AuthError>
              {localizeAuthFeedback(error, locale)}
            </AuthError>
          ) : null}
          <PublicAuthRequestReference requestId={requestReference} />
          <PublicAuthButton
            type="submit"
            className="auth-btn"
            aria-busy={loading || undefined}
            disabled={loading}
          >
            {t(loading ? "auth.v17Recovery.sending"
              : showRetryHint ? "auth.v17Recovery.forgotRetry" : "auth.v17Recovery.sendRequest")}
            <span className="auth-btn__icon auth-btn__tail" aria-hidden="true">
              {loading ? <span className="auth-spinner" /> : <ArrowRight size={18} className="auth-btn__arrow" />}
            </span>
          </PublicAuthButton>
        </form>
      )}

    </AuthV17Layout>
  );
}
