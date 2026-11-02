import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { PasswordConfirmationFeedback } from "@/components/PasswordConfirmationFeedback";
import { PasswordInput } from "@/components/PasswordInput";
import { PublicAuthButton } from "@/components/PublicAuthControls";
import { CredentialRecoveryLayout } from "@/components/auth/CredentialRecoveryLayout";
import { PublicAuthRequestReference } from "@/components/auth/PublicAuthRequestReference";
import { useAuthLocale } from "@/components/auth/useAuthLocale";
import {
  resetPasswordWithToken,
  type PasswordResetTokenValidationPayload,
  validatePasswordResetToken,
} from "@/lib/api/auth";
import { getAuthErrorMessage, localizeAuthFeedback } from "@/lib/auth-flow-feedback";
import { getAriaInvalidProps } from "@/lib/aria-state-props";
import { broadcastForcedLogout } from "@/lib/auth-session";
import {
  hasPublicAuthFieldErrors,
  validatePasswordFields,
} from "@/pages/public-auth-form-utils";
import {
  getPasswordCreationFieldErrors,
  getPasswordCreationSubmitHint,
  getPasswordCreationValidationStates,
  localizePasswordFeedback,
} from "@/pages/password-creation-feedback";
import {
  getPublicAuthTokenFromLocation,
  isPublicAuthAbortError,
} from "@/pages/public-auth-runtime-utils";
import { getResetTokenRecoveryAction, getResetTokenValidationFailure } from "@/pages/reset-token-validation-feedback";
import { beginPublicAuthActionFocus } from "@/pages/public-auth-action-focus";
import { getPublicAuthRequestReference } from "@/pages/public-auth-request-reference";

const RESET_LINK_VALIDATION_TIMEOUT_MS = 15_000;

type ResetPhase = "invalid" | "ready" | "success" | "validating" | "verification-error";

type ResetPasswordPageProps = {
  onBackToHome?: () => void;
  onBackToLogin?: () => void;
  onRequestNewLink?: () => void;
};

export default function ResetPasswordPage({ onBackToHome, onBackToLogin, onRequestNewLink }: ResetPasswordPageProps = {}) {
  const [, navigate] = useLocation();
  const { locale, t } = useAuthLocale();
  const token = useMemo(() => getPublicAuthTokenFromLocation(), []);
  const [reset, setReset] = useState<PasswordResetTokenValidationPayload | null>(null);
  const [phase, setPhase] = useState<ResetPhase>(token ? "validating" : "invalid");
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [validationRateLimited, setValidationRateLimited] = useState(false);
  const [validationTimedOut, setValidationTimedOut] = useState(false);
  const [requestReference, setRequestReference] = useState<string | null>(null);
  const [invalidAction, setInvalidAction] = useState<"sign-in" | "request-link">("request-link");
  const [retryAfterMs, setRetryAfterMs] = useState(0);
  const [retryWaiting, setRetryWaiting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordInteracted, setNewPasswordInteracted] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [invalidFocusRequest, setInvalidFocusRequest] = useState<{ field: "newPassword" | "confirmPassword" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? "" : "Pautan tetapan semula kata laluan tidak sah.");
  const mountedRef = useRef(true);
  const validationAbortControllerRef = useRef<AbortController | null>(null);
  const resetAbortControllerRef = useRef<AbortController | null>(null);
  const newPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const successRef = useRef<HTMLDivElement | null>(null);
  const actionFocusRef = useRef<ReturnType<typeof beginPublicAuthActionFocus> | null>(null);

  const navigateToLogin = () => {
    if (onBackToLogin) {
      onBackToLogin();
      return;
    }

    navigate("/");
  };

  const navigateToNewLink = () => {
    if (onRequestNewLink) {
      onRequestNewLink();
      return;
    }
    navigate("/forgot-password");
  };

  const layoutBackProps = onBackToHome ? { onBackClick: onBackToHome } : {};

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      actionFocusRef.current?.cancel();
      validationAbortControllerRef.current?.abort();
      validationAbortControllerRef.current = null;
      resetAbortControllerRef.current?.abort();
      resetAbortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setPhase("invalid");
      setError("Pautan tetapan semula kata laluan tidak sah.");
      return undefined;
    }

    validationAbortControllerRef.current?.abort();
    const controller = new AbortController();
    validationAbortControllerRef.current = controller;
    const validationTimer = window.setTimeout(() => {
      if (!mountedRef.current || controller.signal.aborted || validationAbortControllerRef.current !== controller) return;
      controller.abort();
      validationAbortControllerRef.current = null;
      setReset(null);
      setRequestReference(null);
      setValidationTimedOut(true);
      setPhase("verification-error");
    }, RESET_LINK_VALIDATION_TIMEOUT_MS);

    const runValidation = async () => {
      setPhase("validating");
      setReset(null);
      setError("");
      setValidationRateLimited(false);
      setValidationTimedOut(false);
      setRequestReference(null);
      setInvalidAction("request-link");
      setRetryAfterMs(0);
      setRetryWaiting(false);

      try {
        const response = await validatePasswordResetToken({ token }, { signal: controller.signal });
        if (!mountedRef.current || controller.signal.aborted) return;
        setReset(response.reset);
        setPhase("ready");
      } catch (validationError) {
        if (
          isPublicAuthAbortError(validationError)
          || !mountedRef.current
          || controller.signal.aborted
        ) {
          return;
        }
        setReset(null);
        const failure = getResetTokenValidationFailure(validationError);
        setPhase(failure.retryable ? "verification-error" : "invalid");
        setInvalidAction(getResetTokenRecoveryAction(validationError) ?? "request-link");
        setRequestReference(failure.retryable && !failure.rateLimited ? getPublicAuthRequestReference(validationError) : null);
        setValidationRateLimited(failure.rateLimited);
        setRetryAfterMs(failure.retryAfterMs);
        setRetryWaiting(failure.retryAfterMs > 0);
        setError(failure.retryable && !failure.rateLimited ? ""
          : getAuthErrorMessage(validationError, "Pautan tetapan semula tidak sah atau telah tamat tempoh.", "reset"));
      } finally {
        window.clearTimeout(validationTimer);
        if (validationAbortControllerRef.current === controller) {
          validationAbortControllerRef.current = null;
        }
      }
    };

    void runValidation();
    return () => {
      window.clearTimeout(validationTimer);
      controller.abort();
      if (validationAbortControllerRef.current === controller) {
        validationAbortControllerRef.current = null;
      }
    };
  }, [token, validationAttempt]);

  useEffect(() => {
    if (phase !== "verification-error" || retryAfterMs <= 0) return;
    const timer = window.setTimeout(() => setRetryWaiting(false), retryAfterMs);
    return () => window.clearTimeout(timer);
  }, [phase, retryAfterMs]);

  useEffect(() => {
    if (phase === "validating") return;
    actionFocusRef.current?.complete(phase === "ready" ? newPasswordInputRef.current
      : phase === "success" ? successRef.current : headingRef.current);
    actionFocusRef.current = null;
  }, [phase]);

  useEffect(() => {
    if (!invalidFocusRequest || loading) return;
    setInvalidFocusRequest(null);
    if (phase !== "ready") return;
    const target = invalidFocusRequest.field === "newPassword" ? newPasswordInputRef.current : confirmPasswordInputRef.current;
    actionFocusRef.current?.complete(target, { revealIfNeeded: true });
    actionFocusRef.current = null;
  }, [invalidFocusRequest, loading, phase]);

  const handleResetPassword = async () => {
    if (!reset || loading || phase !== "ready" || resetAbortControllerRef.current) return;

    setNewPasswordInteracted(true);
    setError("");
    setRequestReference(null);
    setNewPasswordError("");
    setConfirmPasswordError("");
    setInvalidFocusRequest(null);
    actionFocusRef.current?.cancel();
    actionFocusRef.current = beginPublicAuthActionFocus();

    const fieldErrors = validatePasswordFields({
      newPassword,
      confirmPassword,
    });
    if (hasPublicAuthFieldErrors(fieldErrors)) {
      setNewPasswordError(fieldErrors.newPassword ?? "");
      setConfirmPasswordError(fieldErrors.confirmPassword ?? "");
      setInvalidFocusRequest({ field: fieldErrors.newPassword ? "newPassword" : "confirmPassword" });
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    resetAbortControllerRef.current = controller;

    try {
      await resetPasswordWithToken({
        token,
        newPassword,
        confirmPassword,
      }, {
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }
      broadcastForcedLogout(
        "Sesi lama anda telah tamat kerana kata laluan telah ditetapkan semula. Sila log masuk semula.",
      );
      setNewPassword("");
      setConfirmPassword("");
      setPhase("success");
    } catch (resetError) {
      if (
        isPublicAuthAbortError(resetError)
        || !mountedRef.current
        || controller.signal.aborted
      ) {
        actionFocusRef.current?.cancel();
        actionFocusRef.current = null;
        return;
      }
      const fieldErrors = getPasswordCreationFieldErrors(resetError);
      const hasFieldErrors = hasPublicAuthFieldErrors(fieldErrors);
      const recoveryAction = hasFieldErrors ? null : getResetTokenRecoveryAction(resetError);
      if (!hasFieldErrors && !recoveryAction) {
        actionFocusRef.current?.cancel();
        actionFocusRef.current = null;
      }
      if (hasFieldErrors) {
        setNewPasswordError(fieldErrors.newPassword ?? "");
        setConfirmPasswordError(fieldErrors.confirmPassword ?? "");
        setInvalidFocusRequest({ field: fieldErrors.newPassword ? "newPassword" : "confirmPassword" });
      } else {
        if (recoveryAction) {
          setInvalidAction(recoveryAction);
          setReset(null);
          setNewPassword("");
          setConfirmPassword("");
          setPhase("invalid");
        } else {
          setRequestReference(getPublicAuthRequestReference(resetError));
        }
        setError(getAuthErrorMessage(resetError, "Tetapan semula kata laluan gagal.", "reset"));
      }
    } finally {
      if (resetAbortControllerRef.current === controller) {
        resetAbortControllerRef.current = null;
      }
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const validateNewPasswordOnBlur = () => {
    setNewPasswordInteracted(true);
    const fieldErrors = validatePasswordFields({
      newPassword,
      confirmPassword,
    });
    setNewPasswordError(fieldErrors.newPassword ?? "");
    if (confirmPassword) {
      setConfirmPasswordError(fieldErrors.confirmPassword ?? "");
    }
  };

  const validateConfirmPasswordOnBlur = () => {
    if (!confirmPassword) return;
    const fieldErrors = validatePasswordFields({
      newPassword,
      confirmPassword,
    });
    setConfirmPasswordError(fieldErrors.confirmPassword ?? "");
  };

  const validationStates = getPasswordCreationValidationStates({
    newPassword,
    confirmPassword,
    newPasswordInteracted,
    newPasswordError,
    confirmPasswordError,
  });
  const newPasswordDescribedBy = [
    "reset-password-strength",
    newPasswordError ? "reset-password-new-error" : null,
  ].filter(Boolean).join(" ");
  const newPasswordInvalidProps = {
    "aria-describedby": newPasswordDescribedBy,
    ...getAriaInvalidProps(validationStates.newPassword === "error"),
  };
  const confirmPasswordInvalidProps = {
    ...getAriaInvalidProps(validationStates.confirmPassword === "error"),
    "aria-describedby": "reset-password-confirm-error",
  };
  const description = t(phase === "success" ? "auth.v17Recovery.resetSuccessDescription"
    : phase === "invalid" ? invalidAction === "sign-in" ? "auth.v17Recovery.resetUsedDescription" : "auth.v17Recovery.resetInvalidDescription"
      : phase === "verification-error" ? "auth.v17Recovery.validationUnavailableDescription"
        : phase === "validating" ? "auth.v17Recovery.resetValidatingDescription"
          : "auth.v17Recovery.resetReadyDescription");

  return (
    <CredentialRecoveryLayout
      intent="reset"
      illustration
      stableLayout
      headingRef={headingRef}
      account={phase === "ready" ? reset : null}
      title={t(phase === "success" ? "auth.v17Recovery.resetSuccessTitle"
        : phase === "invalid" ? invalidAction === "sign-in" ? "auth.v17Recovery.resetUsedTitle" : "auth.v17Recovery.invalidTitle"
          : phase === "verification-error" ? "auth.v17Recovery.validationUnavailableTitle"
            : "auth.v17Recovery.resetTitle")}
      description={description}
      contextDescription={t("auth.v17Recovery.resetSecurityContext")}
      contentBusy={loading || phase === "validating"}
      {...layoutBackProps}
    >
      {phase === "validating" ? (
        <div className="public-auth-status-card public-auth-status-card--info" role="status" aria-live="polite">
          {t("auth.v17Recovery.resetValidating")}
        </div>
      ) : null}

      {phase === "invalid" ? (
        <div className="public-auth-status-card public-auth-status-card--error" role="alert">
          {localizeAuthFeedback(error, locale) || t("auth.v17Recovery.resetInvalid")}
        </div>
      ) : null}

      {phase === "verification-error" ? (
        <div className="public-auth-status-card public-auth-status-card--error" role="alert">
          {validationRateLimited ? localizeAuthFeedback(error, locale)
            : t(validationTimedOut ? "auth.v17Recovery.validationTimedOut" : "auth.v17Recovery.validationUnavailable")}
        </div>
      ) : null}

      {phase === "verification-error" ? <PublicAuthRequestReference requestId={requestReference} /> : null}

      {phase === "success" ? (
        <div ref={successRef} tabIndex={-1} className="public-auth-status-card public-auth-status-card--success" role="status" aria-live="polite">
          {t("auth.v17Recovery.resetSuccess")}
        </div>
      ) : null}

      {phase === "ready" && reset ? (
        <form
          className="password-creation-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleResetPassword();
          }}
        >
          <div className="space-y-2">
            <label htmlFor="reset-password-new-password" className="public-auth-field-label">
              {t("auth.v17Recovery.newPassword")}
            </label>
            <PasswordInput
              ref={newPasswordInputRef}
              id="reset-password-new-password"
              name="newPassword"
              variant="public-auth"
              visibilityLabel={t("auth.v17Recovery.newPasswordVisibility")}
              locale={locale}
              capsLockMessage={t("auth.v17Recovery.capsLock")}
              value={newPassword}
              data-validation-state={validationStates.newPassword}
              onChange={(event) => {
                setNewPasswordInteracted(true);
                setNewPassword(event.target.value);
                setNewPasswordError("");
                setConfirmPasswordError("");
                setError("");
                setRequestReference(null);
              }}
              onBlur={validateNewPasswordOnBlur}
              placeholder={t("auth.v17Recovery.newPasswordPlaceholder")}
              autoComplete="new-password"
              required
              disabled={loading}
              {...newPasswordInvalidProps}
            />
          </div>
          <PasswordStrengthMeter
            id="reset-password-strength"
            password={newPassword}
            variant="checklist"
            density="compact"
            className="credential-recovery-requirements"
            interacted={newPasswordInteracted}
            locale={locale}
          />
          {newPasswordError ? (
            <p id="reset-password-new-error" className="public-auth-field-error" role="alert">
              {localizePasswordFeedback(newPasswordError, locale)}
            </p>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="reset-password-confirm-password" className="public-auth-field-label">
              {t("auth.v17Recovery.confirmPassword")}
            </label>
            <PasswordInput
              ref={confirmPasswordInputRef}
              id="reset-password-confirm-password"
              name="confirmPassword"
              variant="public-auth"
              visibilityLabel={t("auth.v17Recovery.confirmPasswordVisibility")}
              locale={locale}
              capsLockMessage={t("auth.v17Recovery.capsLock")}
              value={confirmPassword}
              data-validation-state={validationStates.confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setConfirmPasswordError("");
                setError("");
                setRequestReference(null);
              }}
              onBlur={validateConfirmPasswordOnBlur}
              placeholder={t("auth.v17Recovery.confirmPasswordPlaceholder")}
              autoComplete="new-password"
              required
              disabled={loading}
              {...confirmPasswordInvalidProps}
            />
          </div>
          <PasswordConfirmationFeedback
            id="reset-password-confirm-error"
            password={newPassword}
            confirmation={confirmPassword}
            requiredError={localizePasswordFeedback(confirmPasswordError, locale)}
            variant="enhanced"
            locale={locale}
          />
          {error ? (
            <div className="public-auth-status-card public-auth-status-card--error" role="alert">
              {localizeAuthFeedback(error, locale)}
            </div>
          ) : null}
          <PublicAuthRequestReference requestId={requestReference} />
          <p id="reset-password-submit-help" className="password-creation-form__submit-hint">
            {localizePasswordFeedback(getPasswordCreationSubmitHint({ newPassword, confirmPassword, loading, newPasswordError, confirmPasswordError }), locale)}
          </p>
          <PublicAuthButton
            type="submit"
            aria-describedby="reset-password-submit-help"
            disabled={loading}
          >
            {t(loading ? "auth.v17Recovery.resetting" : "auth.v17Recovery.resetSubmit")}
          </PublicAuthButton>
        </form>
      ) : null}

      {phase === "invalid" ? <PublicAuthButton type="button" onClick={invalidAction === "sign-in" ? navigateToLogin : navigateToNewLink}>
        {t(invalidAction === "sign-in" ? "auth.v17Recovery.signIn" : "auth.v17Recovery.requestNewLink")}
      </PublicAuthButton> : null}

      {phase === "verification-error" ? <PublicAuthButton type="button" disabled={retryWaiting} onClick={() => {
        if (retryWaiting || validationAbortControllerRef.current) return;
        actionFocusRef.current?.cancel();
        actionFocusRef.current = beginPublicAuthActionFocus();
        setPhase("validating");
        setValidationAttempt((attempt) => attempt + 1);
      }}>
        {t(retryWaiting ? "auth.v17Recovery.retryWaiting" : "auth.v17Recovery.retryValidation")}
      </PublicAuthButton> : null}

      <PublicAuthButton
        type="button"
        variant={phase === "success" ? "primary" : "ghost"}
        onClick={phase === "invalid" && invalidAction === "sign-in" ? navigateToNewLink : navigateToLogin}
      >
        {phase !== "success" ? <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" /> : null}
        {t(phase === "success" ? "auth.v17Recovery.signIn"
          : phase === "invalid" && invalidAction === "sign-in" ? "auth.v17Recovery.requestNewLink" : "auth.v17Recovery.backToLogin")}
      </PublicAuthButton>
    </CredentialRecoveryLayout>
  );
}
