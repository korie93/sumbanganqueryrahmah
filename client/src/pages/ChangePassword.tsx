import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, LogOut } from "lucide-react";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { PasswordConfirmationFeedback } from "@/components/PasswordConfirmationFeedback";
import { PasswordInput } from "@/components/PasswordInput";
import { PublicAuthButton } from "@/components/PublicAuthControls";
import { PublicAuthLayout } from "@/components/PublicAuthLayout";
import { changeMyPassword } from "@/lib/api/auth";
import { getAriaInvalidProps } from "@/lib/aria-state-props";
import { getApiErrorMessage } from "@/lib/api-errors";
import {
  broadcastForcedLogout,
  clearAuthenticatedUserStorage,
  setStoredForcePasswordChange,
} from "@/lib/auth-session";
import {
  hasPublicAuthFieldErrors,
  validatePasswordFields,
} from "@/pages/public-auth-form-utils";
import { isPublicAuthAbortError } from "@/pages/public-auth-runtime-utils";

type ChangePasswordPageProps = {
  username?: string;
  forced?: boolean;
};

const CHANGE_PASSWORD_FORCE_LOGOUT_REDIRECT_DELAY_MS = 900;

export default function ChangePasswordPage({
  username,
  forced = false,
}: ChangePasswordPageProps) {
  const [, navigate] = useLocation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const mountedRef = useRef(true);
  const changePasswordRequestIdRef = useRef(0);
  const changePasswordAbortControllerRef = useRef<AbortController | null>(null);
  const redirectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      changePasswordRequestIdRef.current += 1;
      changePasswordAbortControllerRef.current?.abort("unmount");
      changePasswordAbortControllerRef.current = null;
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, []);

  const handleLogout = () => {
    changePasswordRequestIdRef.current += 1;
    changePasswordAbortControllerRef.current?.abort("logout");
    changePasswordAbortControllerRef.current = null;
    if (redirectTimeoutRef.current) {
      window.clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    clearAuthenticatedUserStorage();
    navigate("/");
  };

  const handleSubmit = async () => {
    const requestId = ++changePasswordRequestIdRef.current;
    changePasswordAbortControllerRef.current?.abort("superseded");
    changePasswordAbortControllerRef.current = null;
    let controller: AbortController | null = null;
    setError("");
    setSuccessMessage("");
    setCurrentPasswordError("");
    setNewPasswordError("");
    setConfirmPasswordError("");
    setLoading(true);

    try {
      const fieldErrors = validatePasswordFields({
        currentPassword,
        newPassword,
        confirmPassword,
        requireCurrentPassword: true,
      });
      if (hasPublicAuthFieldErrors(fieldErrors)) {
        setCurrentPasswordError(fieldErrors.currentPassword ?? "");
        setNewPasswordError(fieldErrors.newPassword ?? "");
        setConfirmPasswordError(fieldErrors.confirmPassword ?? "");
        return;
      }

      controller = new AbortController();
      changePasswordAbortControllerRef.current = controller;

      const response = await changeMyPassword({
        currentPassword,
        newPassword,
      }, {
        signal: controller.signal,
      });
      if (
        !mountedRef.current
        || controller.signal.aborted
        || requestId !== changePasswordRequestIdRef.current
      ) {
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      if (response?.forceLogout) {
        broadcastForcedLogout("Password changed. Please login again.");
        setSuccessMessage("Kata laluan berjaya dikemas kini. Sila log masuk semula.");
        if (redirectTimeoutRef.current) {
          window.clearTimeout(redirectTimeoutRef.current);
        }
        redirectTimeoutRef.current = window.setTimeout(() => {
          redirectTimeoutRef.current = null;
          navigate("/");
        }, CHANGE_PASSWORD_FORCE_LOGOUT_REDIRECT_DELAY_MS);
        return;
      }

      setStoredForcePasswordChange(false);
      setSuccessMessage("Kata laluan berjaya dikemas kini.");
    } catch (submitError) {
      if (
        isPublicAuthAbortError(submitError) ||
        !mountedRef.current ||
        requestId !== changePasswordRequestIdRef.current
      ) {
        return;
      }
      setError(getApiErrorMessage(submitError, "Pertukaran kata laluan gagal."));
    } finally {
      if (changePasswordAbortControllerRef.current === controller) {
        changePasswordAbortControllerRef.current = null;
      }
      if (mountedRef.current && requestId === changePasswordRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const validateCurrentPasswordOnBlur = () => {
    const fieldErrors = validatePasswordFields({
      currentPassword,
      newPassword,
      confirmPassword,
      requireCurrentPassword: true,
    });
    setCurrentPasswordError(fieldErrors.currentPassword ?? "");
  };

  const validateNewPasswordOnBlur = () => {
    const fieldErrors = validatePasswordFields({
      currentPassword,
      newPassword,
      confirmPassword,
      requireCurrentPassword: true,
    });
    setNewPasswordError(fieldErrors.newPassword ?? "");
    if (confirmPassword) {
      setConfirmPasswordError(fieldErrors.confirmPassword ?? "");
    }
  };

  const validateConfirmPasswordOnBlur = () => {
    const fieldErrors = validatePasswordFields({
      currentPassword,
      newPassword,
      confirmPassword,
      requireCurrentPassword: true,
    });
    setConfirmPasswordError(fieldErrors.confirmPassword ?? "");
  };

  const currentPasswordInvalidProps = currentPasswordError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "change-password-current-error",
    }
    : {};
  const newPasswordDescribedBy = [
    "change-password-strength",
    newPasswordError ? "change-password-new-error" : null,
  ].filter(Boolean).join(" ");
  const newPasswordInvalidProps = {
    "aria-describedby": newPasswordDescribedBy,
    ...(newPasswordError ? { "aria-invalid": "true" as const } : {}),
  };
  const confirmPasswordInvalidProps = {
    ...getAriaInvalidProps(Boolean(confirmPassword ? newPassword !== confirmPassword : confirmPasswordError)),
    "aria-describedby": "change-password-confirm-error",
  };

  return (
    <PublicAuthLayout
      badge="Keselamatan Akaun"
      title="Tukar Kata Laluan"
      description={
        forced
          ? `Pertukaran kata laluan diwajibkan untuk ${username || "akaun ini"} sebelum sistem boleh digunakan sepenuhnya.`
          : "Kemas kini kata laluan akaun anda bagi memastikan akses kekal selamat dan terkawal."
      }
      icon={<KeyRound className="h-7 w-7" />}
      showBackButton={false}
      contentBusy={loading}
    >
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/75">
        Gunakan kata laluan baharu yang sukar diteka dan pastikan pengesahan kata laluan sama
        seperti yang dimasukkan.
      </div>

      <div className="space-y-2">
        <label htmlFor="change-password-current-password" className="public-auth-field-label">
          Kata laluan semasa
        </label>
        <PasswordInput
          id="change-password-current-password"
          name="currentPassword"
          variant="public-auth"
          visibilityLabel="kata laluan semasa"
          value={currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
            setCurrentPasswordError("");
            setError("");
          }}
          onBlur={validateCurrentPasswordOnBlur}
          placeholder="Kata laluan semasa"
          autoComplete="current-password"
          disabled={loading}
          {...currentPasswordInvalidProps}
        />
      </div>
      {currentPasswordError ? (
        <p id="change-password-current-error" className="text-sm text-amber-100" role="alert">
          {currentPasswordError}
        </p>
      ) : null}
      <div className="space-y-2">
        <label htmlFor="change-password-new-password" className="public-auth-field-label">
          Kata laluan baharu
        </label>
        <PasswordInput
          id="change-password-new-password"
          name="newPassword"
          variant="public-auth"
          visibilityLabel="kata laluan baharu"
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value);
            setNewPasswordError("");
            setConfirmPasswordError("");
            setError("");
          }}
          onBlur={validateNewPasswordOnBlur}
          placeholder="Kata laluan baharu"
          autoComplete="new-password"
          disabled={loading}
          {...newPasswordInvalidProps}
        />
      </div>
      <PasswordStrengthMeter
        id="change-password-strength"
        password={newPassword}
      />
      {newPasswordError ? (
        <p id="change-password-new-error" className="text-sm text-amber-100" role="alert">
          {newPasswordError}
        </p>
      ) : null}
      <div className="space-y-2">
        <label htmlFor="change-password-confirm-password" className="public-auth-field-label">
          Sahkan kata laluan baharu
        </label>
        <PasswordInput
          id="change-password-confirm-password"
          name="confirmPassword"
          variant="public-auth"
          visibilityLabel="pengesahan kata laluan baharu"
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            setConfirmPasswordError("");
            setError("");
          }}
          onBlur={validateConfirmPasswordOnBlur}
          placeholder="Masukkan semula kata laluan baharu"
          autoComplete="new-password"
          disabled={loading}
          {...confirmPasswordInvalidProps}
        />
      </div>
      <PasswordConfirmationFeedback
        id="change-password-confirm-error"
        password={newPassword}
        confirmation={confirmPassword}
        requiredError={confirmPasswordError}
      />

      {error ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100" role="alert">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm leading-7 text-emerald-100" role="status" aria-live="polite">
          {successMessage}
        </div>
      ) : null}

      <PublicAuthButton
        onClick={() => void handleSubmit()}
        disabled={loading}
      >
        {loading ? "Sedang mengemas kini..." : "Kemas Kini Kata Laluan"}
      </PublicAuthButton>

      <PublicAuthButton
        type="button"
        variant="ghost"
        onClick={handleLogout}
      >
        <LogOut className="mr-2 h-4 w-4" />
        Log Keluar
      </PublicAuthButton>
    </PublicAuthLayout>
  );
}
