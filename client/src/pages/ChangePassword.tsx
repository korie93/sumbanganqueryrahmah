import { useEffect, useRef, useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { PublicAuthLayout } from "@/components/PublicAuthLayout";
import { changeMyPassword } from "@/lib/api/auth";
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
  const submitInFlightRef = useRef(false);
  const changePasswordAbortControllerRef = useRef<AbortController | null>(null);
  const redirectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      submitInFlightRef.current = false;
      changePasswordAbortControllerRef.current?.abort();
      changePasswordAbortControllerRef.current = null;
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, []);

  const handleLogout = () => {
    submitInFlightRef.current = false;
    changePasswordAbortControllerRef.current?.abort();
    changePasswordAbortControllerRef.current = null;
    if (redirectTimeoutRef.current) {
      window.clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    clearAuthenticatedUserStorage();
    window.location.href = "/";
  };

  const handleSubmit = async () => {
    if (loading || submitInFlightRef.current || changePasswordAbortControllerRef.current) {
      return;
    }

    submitInFlightRef.current = true;
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

      const controller = new AbortController();
      changePasswordAbortControllerRef.current = controller;

      const response = await changeMyPassword({
        currentPassword,
        newPassword,
      }, {
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      if (response?.forceLogout) {
        broadcastForcedLogout("Password changed. Please login again.");
        setSuccessMessage("Kata laluan berjaya dikemas kini. Sila log masuk semula.");
        if (redirectTimeoutRef.current) {
          window.clearTimeout(redirectTimeoutRef.current);
        }
        redirectTimeoutRef.current = window.setTimeout(() => {
          redirectTimeoutRef.current = null;
          window.location.href = "/";
        }, CHANGE_PASSWORD_FORCE_LOGOUT_REDIRECT_DELAY_MS);
        return;
      }

      setStoredForcePasswordChange(false);
      setSuccessMessage("Kata laluan berjaya dikemas kini.");
    } catch (submitError) {
      if (
        isPublicAuthAbortError(submitError) ||
        !mountedRef.current
      ) {
        return;
      }
      setError(getApiErrorMessage(submitError, "Pertukaran kata laluan gagal."));
    } finally {
      submitInFlightRef.current = false;
      changePasswordAbortControllerRef.current = null;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const currentPasswordInvalidProps = currentPasswordError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "change-password-current-error",
    }
    : {};
  const newPasswordInvalidProps = newPasswordError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "change-password-new-error",
    }
    : {};
  const confirmPasswordInvalidProps = confirmPasswordError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "change-password-confirm-error",
    }
    : {};

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

      <PublicAuthInput
        id="change-password-current-password"
        name="currentPassword"
        type="password"
        value={currentPassword}
        onChange={(event) => {
          setCurrentPassword(event.target.value);
          setCurrentPasswordError("");
          setError("");
        }}
        placeholder="Kata laluan semasa"
        autoComplete="current-password"
        disabled={loading}
        {...currentPasswordInvalidProps}
      />
      {currentPasswordError ? (
        <p id="change-password-current-error" className="text-sm text-amber-100" role="alert">
          {currentPasswordError}
        </p>
      ) : null}
      <PublicAuthInput
        id="change-password-new-password"
        name="newPassword"
        type="password"
        value={newPassword}
        onChange={(event) => {
          setNewPassword(event.target.value);
          setNewPasswordError("");
          setError("");
        }}
        placeholder="Kata laluan baharu"
        autoComplete="new-password"
        disabled={loading}
        {...newPasswordInvalidProps}
      />
      {newPasswordError ? (
        <p id="change-password-new-error" className="text-sm text-amber-100" role="alert">
          {newPasswordError}
        </p>
      ) : null}
      <PublicAuthInput
        id="change-password-confirm-password"
        name="confirmPassword"
        type="password"
        value={confirmPassword}
        onChange={(event) => {
          setConfirmPassword(event.target.value);
          setConfirmPasswordError("");
          setError("");
        }}
        placeholder="Sahkan kata laluan baharu"
        autoComplete="new-password"
        disabled={loading}
        {...confirmPasswordInvalidProps}
      />
      {confirmPasswordError ? (
        <p id="change-password-confirm-error" className="text-sm text-amber-100" role="alert">
          {confirmPasswordError}
        </p>
      ) : null}

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
