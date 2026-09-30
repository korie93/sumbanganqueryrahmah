import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, BadgeCheck, KeyRound, ShieldAlert } from "lucide-react";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { PasswordConfirmationFeedback } from "@/components/PasswordConfirmationFeedback";
import { PasswordInput } from "@/components/PasswordInput";
import { PublicAuthButton } from "@/components/PublicAuthControls";
import { AuthV17Layout } from "@/components/auth/AuthV17Layout";
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
  formatPublicAuthExpiry,
  getPublicAuthTokenFromLocation,
  isPublicAuthAbortError,
} from "@/pages/public-auth-runtime-utils";

type ResetPhase = "invalid" | "ready" | "success" | "validating";

type ResetPasswordPageProps = {
  onBackToHome?: () => void;
  onBackToLogin?: () => void;
};

export default function ResetPasswordPage({ onBackToHome, onBackToLogin }: ResetPasswordPageProps = {}) {
  const [, navigate] = useLocation();
  const { locale, t } = useAuthLocale();
  const token = useMemo(() => getPublicAuthTokenFromLocation(), []);
  const [reset, setReset] = useState<PasswordResetTokenValidationPayload | null>(null);
  const [phase, setPhase] = useState<ResetPhase>(token ? "validating" : "invalid");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordInteracted, setNewPasswordInteracted] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? "" : "Pautan tetapan semula kata laluan tidak sah.");
  const mountedRef = useRef(true);
  const validationAbortControllerRef = useRef<AbortController | null>(null);
  const resetAbortControllerRef = useRef<AbortController | null>(null);

  const navigateToLogin = () => {
    if (onBackToLogin) {
      onBackToLogin();
      return;
    }

    navigate("/");
  };

  const layoutBackProps = onBackToHome ? { onBackClick: onBackToHome } : {};

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
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

    const runValidation = async () => {
      setPhase("validating");
      setError("");

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
        setPhase("invalid");
        setError(getAuthErrorMessage(validationError, "Pautan tetapan semula tidak sah atau telah tamat tempoh.", "reset"));
      } finally {
        if (validationAbortControllerRef.current === controller) {
          validationAbortControllerRef.current = null;
        }
      }
    };

    void runValidation();
    return () => {
      controller.abort();
      if (validationAbortControllerRef.current === controller) {
        validationAbortControllerRef.current = null;
      }
    };
  }, [token]);

  const handleResetPassword = async () => {
    if (!reset || loading || phase !== "ready" || resetAbortControllerRef.current) return;

    setNewPasswordInteracted(true);
    setError("");
    setNewPasswordError("");
    setConfirmPasswordError("");

    const fieldErrors = validatePasswordFields({
      newPassword,
      confirmPassword,
    });
    if (hasPublicAuthFieldErrors(fieldErrors)) {
      setNewPasswordError(fieldErrors.newPassword ?? "");
      setConfirmPasswordError(fieldErrors.confirmPassword ?? "");
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
        return;
      }
      const fieldErrors = getPasswordCreationFieldErrors(resetError);
      if (hasPublicAuthFieldErrors(fieldErrors)) {
        setNewPasswordError(fieldErrors.newPassword ?? "");
        setConfirmPasswordError(fieldErrors.confirmPassword ?? "");
      } else {
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

  return (
    <AuthV17Layout
      badge={t("auth.v17Recovery.resetBadge")}
      title={t(phase === "success" ? "auth.v17Recovery.resetSuccessTitle" : phase === "invalid" ? "auth.v17Recovery.invalidTitle" : "auth.v17Recovery.resetTitle")}
      description={t("auth.v17Recovery.resetDescription")}
      contentBusy={loading || phase === "validating"}
      visualMode="minimal"
      className="password-creation-layout"
      icon={
        phase === "invalid" ? (
          <ShieldAlert className="h-7 w-7" aria-hidden="true" focusable="false" />
        ) : phase === "success" ? (
          <BadgeCheck className="h-7 w-7" aria-hidden="true" focusable="false" />
        ) : (
          <KeyRound className="h-7 w-7" aria-hidden="true" focusable="false" />
        )
      }
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

      {phase === "success" ? (
        <div className="public-auth-status-card public-auth-status-card--success" role="status" aria-live="polite">
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
          <dl className="public-auth-account-summary">
            <div className="public-auth-account-summary__row">
              <dt>{t("auth.v17Recovery.username")}</dt>
              <dd>{reset.username}</dd>
            </div>
            <div className="public-auth-account-summary__row">
              <dt>{t("auth.v17Recovery.role")}</dt>
              <dd>{reset.role}</dd>
            </div>
            <div className="public-auth-account-summary__row">
              <dt>{t("auth.v17Recovery.expires")}</dt>
              <dd>{formatPublicAuthExpiry(reset.expiresAt)}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            <label htmlFor="reset-password-new-password" className="public-auth-field-label">
              {t("auth.v17Recovery.newPassword")}
            </label>
            <PasswordInput
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

      {phase === "invalid" ? <PublicAuthButton type="button" onClick={() => navigate("/forgot-password")}>
        {t("auth.v17Recovery.requestNewLink")}
      </PublicAuthButton> : null}

      <PublicAuthButton
        type="button"
        variant="ghost"
        onClick={navigateToLogin}
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" />
        {t("auth.v17Recovery.backToLogin")}
      </PublicAuthButton>
    </AuthV17Layout>
  );
}
