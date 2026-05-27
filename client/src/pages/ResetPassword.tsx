import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, BadgeCheck, KeyRound, ShieldAlert } from "lucide-react";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { PublicAuthLayout } from "@/components/PublicAuthLayout";
import {
  resetPasswordWithToken,
  type PasswordResetTokenValidationPayload,
  validatePasswordResetToken,
} from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api-errors";
import { broadcastForcedLogout } from "@/lib/auth-session";
import {
  hasPublicAuthFieldErrors,
  validatePasswordFields,
} from "@/pages/public-auth-form-utils";
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
  const token = useMemo(() => getPublicAuthTokenFromLocation(), []);
  const [reset, setReset] = useState<PasswordResetTokenValidationPayload | null>(null);
  const [phase, setPhase] = useState<ResetPhase>(token ? "validating" : "invalid");
  const [newPassword, setNewPassword] = useState("");
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
        setError(getApiErrorMessage(validationError, "Pautan tetapan semula tidak sah atau telah tamat tempoh."));
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
      setError(getApiErrorMessage(resetError, "Tetapan semula kata laluan gagal."));
    } finally {
      if (resetAbortControllerRef.current === controller) {
        resetAbortControllerRef.current = null;
      }
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const onPasswordKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      void handleResetPassword();
    }
  };

  const newPasswordDescribedBy = [
    "reset-password-strength",
    newPasswordError ? "reset-password-new-error" : null,
  ].filter(Boolean).join(" ");
  const newPasswordInvalidProps = {
    "aria-describedby": newPasswordDescribedBy,
    ...(newPasswordError ? { "aria-invalid": "true" as const } : {}),
  };
  const confirmPasswordInvalidProps = confirmPasswordError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "reset-password-confirm-error",
    }
    : {};

  return (
    <PublicAuthLayout
      badge="Tetapan Semula Kata Laluan"
      title="Cipta Kata Laluan Baharu"
      description="Gunakan pautan selamat yang dihantar ke emel anda untuk menetapkan kata laluan baharu dan mendapatkan semula akses ke sistem."
      contentBusy={loading || phase === "validating"}
      visualMode="minimal"
      showBackButton={false}
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
          Sedang mengesahkan pautan tetapan semula anda...
        </div>
      ) : null}

      {phase === "invalid" ? (
        <div className="public-auth-status-card public-auth-status-card--error" role="alert">
          {error || "Pautan tetapan semula tidak sah atau telah tamat tempoh."}
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="public-auth-status-card public-auth-status-card--success" role="status" aria-live="polite">
          Tetapan semula kata laluan berjaya. Anda kini boleh log masuk menggunakan username dan
          kata laluan baharu.
        </div>
      ) : null}

      {phase === "ready" && reset ? (
        <>
          <dl className="public-auth-account-summary">
            <div className="public-auth-account-summary__row">
              <dt>Nama pengguna</dt>
              <dd>{reset.username}</dd>
            </div>
            <div className="public-auth-account-summary__row">
              <dt>Peranan</dt>
              <dd>{reset.role}</dd>
            </div>
            <div className="public-auth-account-summary__row">
              <dt>Tamat tempoh</dt>
              <dd>{formatPublicAuthExpiry(reset.expiresAt)}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            <label htmlFor="reset-password-new-password" className="public-auth-field-label">
              Kata laluan baharu
            </label>
            <PublicAuthInput
              id="reset-password-new-password"
              name="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setNewPasswordError("");
                setError("");
              }}
              onKeyDown={onPasswordKeyDown}
              placeholder="Masukkan kata laluan baharu"
              autoComplete="new-password"
              disabled={loading}
              {...newPasswordInvalidProps}
            />
          </div>
          <PasswordStrengthMeter
            id="reset-password-strength"
            password={newPassword}
          />
          {newPasswordError ? (
            <p id="reset-password-new-error" className="public-auth-field-error" role="alert">
              {newPasswordError}
            </p>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="reset-password-confirm-password" className="public-auth-field-label">
              Sahkan kata laluan baharu
            </label>
            <PublicAuthInput
              id="reset-password-confirm-password"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setConfirmPasswordError("");
                setError("");
              }}
              onKeyDown={onPasswordKeyDown}
              placeholder="Masukkan semula kata laluan"
              autoComplete="new-password"
              disabled={loading}
              {...confirmPasswordInvalidProps}
            />
          </div>
          {confirmPasswordError ? (
            <p id="reset-password-confirm-error" className="public-auth-field-error" role="alert">
              {confirmPasswordError}
            </p>
          ) : null}
          {error ? (
            <div className="public-auth-status-card public-auth-status-card--error" role="alert">
              {error}
            </div>
          ) : null}
          <PublicAuthButton
            onClick={() => void handleResetPassword()}
            disabled={loading}
          >
            {loading ? "Sedang menetapkan semula..." : "Tetapkan Kata Laluan Baharu"}
          </PublicAuthButton>
        </>
      ) : null}

      <PublicAuthButton
        type="button"
        variant="ghost"
        onClick={navigateToLogin}
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" />
        Kembali ke log masuk
      </PublicAuthButton>
    </PublicAuthLayout>
  );
}
