import type { AriaAttributes, KeyboardEvent, Ref } from "react";
import { ArrowLeft, BadgeCheck, KeyRound, ShieldAlert } from "lucide-react";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import type { ActivationTokenValidationPayload } from "@/lib/api/auth";
import { formatPublicAuthExpiry } from "@/pages/public-auth-runtime-utils";

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
  onPasswordKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
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
  if (phase === "validating") {
    return (
      <div className="public-auth-status-card public-auth-status-card--info" role="status" aria-live="polite">
        Sedang mengesahkan pautan aktivasi anda...
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="public-auth-status-card public-auth-status-card--error" role="alert">
        {error || "Pautan aktivasi tidak sah atau telah tamat tempoh."}
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="public-auth-status-card public-auth-status-card--success" role="status" aria-live="polite">
        Kata laluan berjaya dicipta. Anda akan dibawa semula ke halaman log masuk sebentar lagi.
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
  onPasswordKeyDown,
}: ActivationPasswordFormProps) {
  return (
    <>
      <dl className="public-auth-account-summary">
        <div className="public-auth-account-summary__row">
          <dt>Nama pengguna</dt>
          <dd>{activation.username}</dd>
        </div>
        <div className="public-auth-account-summary__row">
          <dt>Peranan</dt>
          <dd>{activation.role}</dd>
        </div>
        <div className="public-auth-account-summary__row">
          <dt>Tamat tempoh</dt>
          <dd>{formatPublicAuthExpiry(activation.expiresAt)}</dd>
        </div>
      </dl>
      <div className="space-y-2">
        <label htmlFor="activate-account-new-password" className="public-auth-field-label">
          Kata laluan baharu
        </label>
        <PublicAuthInput
          ref={newPasswordInputRef}
          id="activate-account-new-password"
          name="newPassword"
          type="password"
          value={newPassword}
          onChange={(event) => {
            onNewPasswordChange(event.target.value);
            onClearNewPasswordError();
            onClearFormError();
          }}
          onBlur={onNewPasswordBlur}
          onKeyDown={onPasswordKeyDown}
          placeholder="Masukkan kata laluan baharu"
          autoComplete="new-password"
          disabled={loading}
          {...newPasswordInvalidProps}
        />
      </div>
      <PasswordStrengthMeter
        id="activate-password-strength"
        password={newPassword}
      />
      {newPasswordError ? (
        <p id="activate-password-new-error" className="public-auth-field-error" role="alert">
          {newPasswordError}
        </p>
      ) : null}
      <div className="space-y-2">
        <label htmlFor="activate-account-confirm-password" className="public-auth-field-label">
          Sahkan kata laluan baharu
        </label>
        <PublicAuthInput
          id="activate-account-confirm-password"
          name="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(event) => {
            onConfirmPasswordChange(event.target.value);
            onClearConfirmPasswordError();
            onClearFormError();
          }}
          onBlur={onConfirmPasswordBlur}
          onKeyDown={onPasswordKeyDown}
          placeholder="Masukkan semula kata laluan"
          autoComplete="new-password"
          disabled={loading}
          {...confirmPasswordInvalidProps}
        />
      </div>
      {confirmPasswordError ? (
        <p id="activate-password-confirm-error" className="public-auth-field-error" role="alert">
          {confirmPasswordError}
        </p>
      ) : null}
      {error ? (
        <div className="public-auth-status-card public-auth-status-card--error" role="alert">
          {error}
        </div>
      ) : null}
      <PublicAuthButton
        onClick={onActivate}
        disabled={loading}
      >
        {loading ? "Sedang mencipta kata laluan..." : "Cipta Kata Laluan"}
      </PublicAuthButton>
    </>
  );
}

export function ActivationActions({ onBackToLogin, phase }: ActivationActionsProps) {
  return (
    <>
      {phase === "success" ? (
        <PublicAuthButton
          type="button"
          onClick={onBackToLogin}
        >
          Buka Halaman Log Masuk
        </PublicAuthButton>
      ) : null}

      <PublicAuthButton
        type="button"
        variant="ghost"
        onClick={onBackToLogin}
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" />
        Kembali ke log masuk
      </PublicAuthButton>
    </>
  );
}
