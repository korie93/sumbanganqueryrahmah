import type { AriaAttributes, Ref } from "react";
import { ArrowLeft, BadgeCheck, KeyRound, ShieldAlert } from "lucide-react";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { PasswordConfirmationFeedback } from "@/components/PasswordConfirmationFeedback";
import { PasswordInput } from "@/components/PasswordInput";
import { PublicAuthButton } from "@/components/PublicAuthControls";
import { useAuthLocale } from "@/components/auth/useAuthLocale";
import { localizeAuthFeedback } from "@/lib/auth-flow-feedback";
import type { ActivationTokenValidationPayload } from "@/lib/api/auth";
import { formatPublicAuthExpiry } from "@/pages/public-auth-runtime-utils";
import { getAriaInvalidProps } from "@/lib/aria-state-props";
import {
  getPasswordCreationSubmitHint,
  getPasswordCreationValidationStates,
  localizePasswordFeedback,
} from "@/pages/password-creation-feedback";

export type ActivationPhase = "invalid" | "ready" | "success" | "validating";

type InputAccessibilityProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
};

type ActivateAccountIconProps = {
  phase: ActivationPhase;
};

type ActivationStatusCardProps = {
  error: string;
  phase: ActivationPhase;
};

type ActivationPasswordFormProps = {
  activation: ActivationTokenValidationPayload;
  confirmPassword: string;
  confirmPasswordError: string;
  confirmPasswordInvalidProps: InputAccessibilityProps;
  error: string;
  loading: boolean;
  newPassword: string;
  newPasswordInteracted?: boolean;
  newPasswordError: string;
  newPasswordInputRef: Ref<HTMLInputElement>;
  newPasswordInvalidProps: InputAccessibilityProps;
  onActivate: () => void;
  onClearConfirmPasswordError: () => void;
  onClearFormError: () => void;
  onClearNewPasswordError: () => void;
  onConfirmPasswordBlur: () => void;
  onConfirmPasswordChange: (value: string) => void;
  onNewPasswordBlur: () => void;
  onNewPasswordChange: (value: string) => void;
};

type ActivationActionsProps = {
  onBackToLogin: () => void;
  phase: ActivationPhase;
};

export function ActivateAccountIcon({ phase }: ActivateAccountIconProps) {
  if (phase === "invalid") {
    return <ShieldAlert className="h-7 w-7" aria-hidden="true" focusable="false" />;
  }

  if (phase === "success") {
    return <BadgeCheck className="h-7 w-7" aria-hidden="true" focusable="false" />;
  }

  return <KeyRound className="h-7 w-7" aria-hidden="true" focusable="false" />;
}

export function ActivationStatusCard({ error, phase }: ActivationStatusCardProps) {
  const { locale, t } = useAuthLocale();
  if (phase === "validating") {
    return (
      <div className="public-auth-status-card public-auth-status-card--info" role="status" aria-live="polite">
        {t("auth.v17Recovery.activationValidating")}
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="public-auth-status-card public-auth-status-card--error" role="alert">
        {localizeAuthFeedback(error, locale) || t("auth.v17Recovery.activationInvalid")}
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="public-auth-status-card public-auth-status-card--success" role="status" aria-live="polite">
        {t("auth.v17Recovery.activationSuccess")}
      </div>
    );
  }

  return null;
}

export function ActivationPasswordForm({
  activation,
  confirmPassword,
  confirmPasswordError,
  confirmPasswordInvalidProps,
  error,
  loading,
  newPassword,
  newPasswordInteracted = false,
  newPasswordError,
  newPasswordInputRef,
  newPasswordInvalidProps,
  onActivate,
  onClearConfirmPasswordError,
  onClearFormError,
  onClearNewPasswordError,
  onConfirmPasswordBlur,
  onConfirmPasswordChange,
  onNewPasswordBlur,
  onNewPasswordChange,
}: ActivationPasswordFormProps) {
  const { locale, t } = useAuthLocale();
  const validationStates = getPasswordCreationValidationStates({
    newPassword,
    confirmPassword,
    newPasswordInteracted,
    newPasswordError,
    confirmPasswordError,
  });
  return (
    <form
      className="password-creation-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onActivate();
      }}
    >
      <dl className="public-auth-account-summary">
        <div className="public-auth-account-summary__row">
          <dt>{t("auth.v17Recovery.username")}</dt>
          <dd>{activation.username}</dd>
        </div>
        <div className="public-auth-account-summary__row">
          <dt>{t("auth.v17Recovery.role")}</dt>
          <dd>{activation.role}</dd>
        </div>
        <div className="public-auth-account-summary__row">
          <dt>{t("auth.v17Recovery.expires")}</dt>
          <dd>{formatPublicAuthExpiry(activation.expiresAt)}</dd>
        </div>
      </dl>
      <div className="space-y-2">
        <label htmlFor="activate-account-new-password" className="public-auth-field-label">
          {t("auth.v17Recovery.newPassword")}
        </label>
        <PasswordInput
          ref={newPasswordInputRef}
          id="activate-account-new-password"
          name="newPassword"
          variant="public-auth"
          visibilityLabel={t("auth.v17Recovery.newPasswordVisibility")}
          locale={locale}
          capsLockMessage={t("auth.v17Recovery.capsLock")}
          value={newPassword}
          data-validation-state={validationStates.newPassword}
          onChange={(event) => {
            onNewPasswordChange(event.target.value);
            onClearNewPasswordError();
            onClearConfirmPasswordError();
            onClearFormError();
          }}
          onBlur={onNewPasswordBlur}
          placeholder={t("auth.v17Recovery.newPasswordPlaceholder")}
          autoComplete="new-password"
          required
          disabled={loading}
          {...newPasswordInvalidProps}
          {...getAriaInvalidProps(validationStates.newPassword === "error")}
        />
      </div>
      <PasswordStrengthMeter
        id="activate-password-strength"
        password={newPassword}
        variant="checklist"
        interacted={newPasswordInteracted}
        locale={locale}
      />
      {newPasswordError ? (
        <p id="activate-password-new-error" className="public-auth-field-error" role="alert">
          {localizePasswordFeedback(newPasswordError, locale)}
        </p>
      ) : null}
      <div className="space-y-2">
        <label htmlFor="activate-account-confirm-password" className="public-auth-field-label">
          {t("auth.v17Recovery.confirmPassword")}
        </label>
        <PasswordInput
          id="activate-account-confirm-password"
          name="confirmPassword"
          variant="public-auth"
          visibilityLabel={t("auth.v17Recovery.confirmPasswordVisibility")}
          locale={locale}
          capsLockMessage={t("auth.v17Recovery.capsLock")}
          value={confirmPassword}
          data-validation-state={validationStates.confirmPassword}
          onChange={(event) => {
            onConfirmPasswordChange(event.target.value);
            onClearConfirmPasswordError();
            onClearFormError();
          }}
          onBlur={onConfirmPasswordBlur}
          placeholder={t("auth.v17Recovery.confirmPasswordPlaceholder")}
          autoComplete="new-password"
          required
          disabled={loading}
          {...confirmPasswordInvalidProps}
          {...getAriaInvalidProps(validationStates.confirmPassword === "error")}
          aria-describedby="activate-password-confirm-error"
        />
      </div>
      <PasswordConfirmationFeedback
        id="activate-password-confirm-error"
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
      <p id="activate-password-submit-help" className="password-creation-form__submit-hint">
        {localizePasswordFeedback(getPasswordCreationSubmitHint({ newPassword, confirmPassword, loading, newPasswordError, confirmPasswordError }), locale)}
      </p>
      <PublicAuthButton
        type="submit"
        aria-describedby="activate-password-submit-help"
        disabled={loading}
      >
        {t(loading ? "auth.v17Recovery.creating" : "auth.v17Recovery.createSubmit")}
      </PublicAuthButton>
    </form>
  );
}

export function ActivationActions({ onBackToLogin, phase }: ActivationActionsProps) {
  const { t } = useAuthLocale();
  return (
    <>
      {phase === "success" ? (
        <PublicAuthButton
          type="button"
          onClick={onBackToLogin}
        >
          {t("auth.v17Recovery.openLogin")}
        </PublicAuthButton>
      ) : null}

      <PublicAuthButton
        type="button"
        variant="ghost"
        onClick={onBackToLogin}
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" />
        {t("auth.v17Recovery.backToLogin")}
      </PublicAuthButton>
    </>
  );
}
